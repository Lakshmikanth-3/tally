import { LifecycleEvent as LifecycleEventEvent } from "../generated/SettlementAnchor/SettlementAnchor";
import { Bond, LifecycleEvent, IssuerStanding } from "../generated/schema";

const KIND_NAMES = ["issued", "coupon", "resale", "redeemed", "defaulted"];

export function handleLifecycleEvent(event: LifecycleEventEvent): void {
  const bondId = event.params.bondId.toHexString();
  let bond = Bond.load(bondId);
  if (bond == null) {
    bond = new Bond(bondId);
    bond.issuer = event.params.issuer;
    bond.save();
  }

  const kind = KIND_NAMES[event.params.kind];
  const evt = new LifecycleEvent(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  evt.bond = bondId;
  evt.kind = kind;
  evt.timestamp = event.params.timestamp;
  if (kind == "coupon" || kind == "redeemed") {
    evt.onTime = event.params.onTime;
  }
  evt.hcsTxId = event.params.hcsTxId;
  evt.save();

  const issuerId = event.params.issuer.toHexString();
  let standing = IssuerStanding.load(issuerId);
  if (standing == null) {
    standing = new IssuerStanding(issuerId);
    standing.bondsIssued = 0;
    standing.couponsOnTime = 0;
    standing.couponsLate = 0;
    standing.defaults = 0;
  }
  if (kind == "issued") standing.bondsIssued += 1;
  if (kind == "coupon" && event.params.onTime) standing.couponsOnTime += 1;
  if (kind == "coupon" && !event.params.onTime) standing.couponsLate += 1;
  if (kind == "defaulted") standing.defaults += 1;
  standing.lastUpdated = event.block.timestamp;
  standing.save();
}
