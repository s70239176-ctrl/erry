import {
  Address,
  Blockchain,
  BytesWriter,
  Calldata,
  DeployableOP_20,
  encodeSelector,
  NetEvent,
  OP20InitParameters,
  Selector,
  StoredU256,
  AddressMap,
} from '@btc-vision/btc-runtime/runtime';
import { u128, u256 } from 'as-bignum/assembly';

// ─── Events ────────────────────────────────────────────────────────────────

class DepositEvent extends NetEvent {
  constructor(depositor: Address, amount: u256, newBalance: u256) {
    const writer = new BytesWriter(32 + 32 + 32);
    writer.writeAddress(depositor);
    writer.writeU256(amount);
    writer.writeU256(newBalance);
    super('Deposit', writer);
  }
}

class WithdrawEvent extends NetEvent {
  constructor(withdrawer: Address, amount: u256, newBalance: u256) {
    const writer = new BytesWriter(32 + 32 + 32);
    writer.writeAddress(withdrawer);
    writer.writeU256(amount);
    writer.writeU256(newBalance);
    super('Withdraw', writer);
  }
}

class YieldClaimedEvent extends NetEvent {
  constructor(claimer: Address, yieldAmount: u256, newBalance: u256) {
    const writer = new BytesWriter(32 + 32 + 32);
    writer.writeAddress(claimer);
    writer.writeU256(yieldAmount);
    writer.writeU256(newBalance);
    super('YieldClaimed', writer);
  }
}

// ─── Storage Pointers ──────────────────────────────────────────────────────
// Each pointer must be a unique u16 within the contract
const POINTER_DEPOSITS: u16       = 100; // AddressMap: address -> deposited amount
const POINTER_LAST_BLOCK: u16     = 101; // AddressMap: address -> block number of last action
const POINTER_TOTAL_DEPOSITS: u16 = 102; // u256: total TSAV deposited across all users
const POINTER_TOTAL_YIELD: u16    = 103; // u256: total yield ever paid out

// ─── Constants ─────────────────────────────────────────────────────────────
// 4% APY expressed as basis points = 400
// Monthly rate = 400 / 12 ≈ 33 bps (we use blocks, ~144 blocks/day on Bitcoin)
// Blocks per month ≈ 144 * 30 = 4320
// Monthly yield rate numerator/denominator (fixed-point arithmetic)
const YIELD_NUMERATOR: u256   = u256.fromU32(33);   // 0.33%
const YIELD_DENOMINATOR: u256 = u256.fromU32(10000); // basis point denominator
const BLOCKS_PER_MONTH: u256  = u256.fromU32(4320);  // ~30 days of Bitcoin blocks

// ─── Contract ──────────────────────────────────────────────────────────────

@final
export class SavingsJar extends DeployableOP_20 {

  // Persistent storage maps
  private deposits: AddressMap<u256>;
  private lastClaimBlock: AddressMap<u256>;
  private totalDepositsStored: StoredU256;
  private totalYieldStored: StoredU256;

  public constructor() {
    super();

    // Initialise storage — these load/save to OpNet's Merkle storage
    this.deposits          = new AddressMap<u256>(POINTER_DEPOSITS);
    this.lastClaimBlock    = new AddressMap<u256>(POINTER_LAST_BLOCK);
    this.totalDepositsStored = new StoredU256(POINTER_TOTAL_DEPOSITS, u256.Zero);
    this.totalYieldStored    = new StoredU256(POINTER_TOTAL_YIELD,    u256.Zero);
  }

  // ── Deployment (runs once) ──────────────────────────────────────────────

  public override onDeployment(_calldata: Calldata): void {
    const maxSupply: u256 = u128.fromString('21000000000000000').toU256(); // 21M with 8 decimals
    this.instantiate(new OP20InitParameters(
      maxSupply,
      8,           // decimals
      'TestSave',  // name
      'TSAV',      // symbol
    ));

    // Mint initial supply to deployer for distribution / liquidity
    this._mint(Blockchain.sender, maxSupply);
  }

  // ── Method selector routing ─────────────────────────────────────────────

  public override callMethod(method: Selector, calldata: Calldata): BytesWriter {
    switch (method) {
      case encodeSelector('deposit'):
        return this.deposit(calldata);
      case encodeSelector('withdraw'):
        return this.withdraw(calldata);
      case encodeSelector('claimYield'):
        return this.claimYield();
      case encodeSelector('getDeposit'):
        return this.getDeposit(calldata);
      case encodeSelector('getPendingYield'):
        return this.getPendingYield(calldata);
      case encodeSelector('getTotalDeposits'):
        return this.getTotalDeposits();
      case encodeSelector('getTotalYieldPaid'):
        return this.getTotalYieldPaid();
      default:
        return super.callMethod(method, calldata);
    }
  }

  // ── deposit(amount: u256) ───────────────────────────────────────────────
  // User sends TSAV tokens into the jar. We burn from their wallet and
  // credit their internal balance. Yield accrues from this block.

  private deposit(calldata: Calldata): BytesWriter {
    const sender: Address = Blockchain.sender;
    const amount: u256    = calldata.readU256();

    assert(!amount.isZero(), 'SAVINGS: zero deposit');

    // Auto-claim any pending yield first so we start fresh
    this._autoClaimYield(sender);

    // Burn tokens from sender (they must have approved the contract)
    this._burn(sender, amount);

    // Update internal deposit balance
    const prev: u256      = this.deposits.get(sender) || u256.Zero;
    const newBal: u256    = prev.add(amount);
    this.deposits.set(sender, newBal);

    // Record deposit block for yield tracking
    this.lastClaimBlock.set(sender, u256.fromU64(Blockchain.block.number));

    // Update totals
    this.totalDepositsStored.value = this.totalDepositsStored.value.add(amount);

    this.emitEvent(new DepositEvent(sender, amount, newBal));

    const writer = new BytesWriter(32);
    writer.writeU256(newBal);
    return writer;
  }

  // ── withdraw(amount: u256) ──────────────────────────────────────────────
  // Withdraw principal + auto-claim yield, then remint to user's wallet.

  private withdraw(calldata: Calldata): BytesWriter {
    const sender: Address = Blockchain.sender;
    const amount: u256    = calldata.readU256();

    const balance: u256 = this.deposits.get(sender) || u256.Zero;
    assert(!amount.isZero(), 'SAVINGS: zero withdraw');
    assert(balance.gte(amount),  'SAVINGS: insufficient balance');

    // Claim yield first
    this._autoClaimYield(sender);

    // Deduct from deposit
    const newBal: u256 = balance.sub(amount);
    this.deposits.set(sender, newBal);

    if (newBal.isZero()) {
      this.lastClaimBlock.delete(sender);
    }

    // Update totals
    this.totalDepositsStored.value = this.totalDepositsStored.value.sub(amount);

    // Remint tokens back to user
    this._mint(sender, amount);

    this.emitEvent(new WithdrawEvent(sender, amount, newBal));

    const writer = new BytesWriter(32);
    writer.writeU256(newBal);
    return writer;
  }

  // ── claimYield() ────────────────────────────────────────────────────────
  // Manually claim accrued yield without touching principal.

  private claimYield(): BytesWriter {
    const sender: Address  = Blockchain.sender;
    const yieldAmt: u256   = this._computeYield(sender);

    assert(!yieldAmt.isZero(), 'SAVINGS: no yield to claim');

    // Reset claim block
    this.lastClaimBlock.set(sender, u256.fromU64(Blockchain.block.number));

    // Mint yield tokens to user
    this._mint(sender, yieldAmt);

    // Track total yield paid
    this.totalYieldStored.value = this.totalYieldStored.value.add(yieldAmt);

    const newBal = this.deposits.get(sender) || u256.Zero;
    this.emitEvent(new YieldClaimedEvent(sender, yieldAmt, newBal));

    const writer = new BytesWriter(32);
    writer.writeU256(yieldAmt);
    return writer;
  }

  // ── getDeposit(address) ─────────────────────────────────────────────────

  private getDeposit(calldata: Calldata): BytesWriter {
    const addr: Address  = calldata.readAddress();
    const bal: u256      = this.deposits.get(addr) || u256.Zero;
    const writer = new BytesWriter(32);
    writer.writeU256(bal);
    return writer;
  }

  // ── getPendingYield(address) ────────────────────────────────────────────

  private getPendingYield(calldata: Calldata): BytesWriter {
    const addr: Address  = calldata.readAddress();
    const pending: u256  = this._computeYield(addr);
    const writer = new BytesWriter(32);
    writer.writeU256(pending);
    return writer;
  }

  // ── getTotalDeposits() ──────────────────────────────────────────────────

  private getTotalDeposits(): BytesWriter {
    const writer = new BytesWriter(32);
    writer.writeU256(this.totalDepositsStored.value);
    return writer;
  }

  // ── getTotalYieldPaid() ─────────────────────────────────────────────────

  private getTotalYieldPaid(): BytesWriter {
    const writer = new BytesWriter(32);
    writer.writeU256(this.totalYieldStored.value);
    return writer;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  // Yield formula:
  //   monthsElapsed = blocksSinceLastClaim / BLOCKS_PER_MONTH
  //   yield = balance * YIELD_NUMERATOR/YIELD_DENOMINATOR * monthsElapsed
  private _computeYield(addr: Address): u256 {
    const balance: u256 = this.deposits.get(addr) || u256.Zero;
    if (balance.isZero()) return u256.Zero;

    const lastBlock: u256 = this.lastClaimBlock.get(addr) || u256.Zero;
    if (lastBlock.isZero()) return u256.Zero;

    const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
    if (currentBlock.lte(lastBlock)) return u256.Zero;

    const blocksDelta: u256 = currentBlock.sub(lastBlock);

    // monthsElapsed (integer) = blocksDelta / BLOCKS_PER_MONTH
    const monthsElapsed: u256 = blocksDelta.div(BLOCKS_PER_MONTH);
    if (monthsElapsed.isZero()) return u256.Zero;

    // yield = balance * monthsElapsed * YIELD_NUMERATOR / YIELD_DENOMINATOR
    return balance
      .mul(monthsElapsed)
      .mul(YIELD_NUMERATOR)
      .div(YIELD_DENOMINATOR);
  }

  private _autoClaimYield(addr: Address): void {
    const yieldAmt: u256 = this._computeYield(addr);
    if (yieldAmt.isZero()) return;

    this.lastClaimBlock.set(addr, u256.fromU64(Blockchain.block.number));
    this._mint(addr, yieldAmt);
    this.totalYieldStored.value = this.totalYieldStored.value.add(yieldAmt);

    const newBal = this.deposits.get(addr) || u256.Zero;
    this.emitEvent(new YieldClaimedEvent(addr, yieldAmt, newBal));
  }
}
