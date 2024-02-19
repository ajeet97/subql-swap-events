import { SwapEvent } from "../types";
import { CosmosEvent } from "@subql/types-cosmos";
import { Event } from '@cosmjs/stargate';
import { toSeconds } from '@cosmjs/tendermint-rpc/build/dates';
import assert from "assert";

export async function handleSwapEvent(e: CosmosEvent): Promise<void> {
  logger.info(`New swap event at block: ${e.block.header.height}`)

  const offerAsset = getAssetAttribute(e.event, "asset_in")
  const askAsset = getAssetAttribute(e.event, "asset_out")
  const feeAssetAttr = getAttributeValue(e.event, "fee_asset")
  const feeAsset = !feeAssetAttr ? offerAsset.info : getAssetInfo(JSON.parse(feeAssetAttr))
  const totalFee = BigInt(getAttributeValue(e.event, "total_fee")) || BigInt(0)
  const protocolFee = BigInt(getAttributeValue(e.event, "protocol_fee")) || BigInt(0)
  const lpEarnedFee = totalFee - protocolFee

  const swapID = [
    e.tx.hash,
    e.msg.idx,
    offerAsset.info.identifier,
  ].join('_')

  logger.info(`swap id: ${swapID}`)

  const blockTimeSec = toSeconds(e.block.header.time).seconds

  const swap = SwapEvent.create({
    id: swapID,
    txHash: e.tx.hash,
    blockHeight: BigInt(e.block.header.height),
    blockTime: BigInt(blockTimeSec),
    poolId: getAttributeValue(e.event, "pool_id"),
    swapType: getAttributeValue(e.event, "swap_type"),
    feeAsset: feeAsset.identifier,
    totalFee: totalFee,
    protocolFee: protocolFee,
    lpEarnedFee: lpEarnedFee,
    offerAsset: offerAsset.info.identifier,
    offerAmount: offerAsset.amount,
    askAsset: askAsset.info.identifier,
    askAmount: askAsset.amount,
    user: getAttributeValue(e.event, "sender"),
    recipient: getAttributeValue(e.event, "recipient")
  })
  return swap.save()
}

function getAttributeValue(event: Event, key: string): string {
  for (const attr of event.attributes) if (attr.key === key) return attr.value
  return ""
}

function getAssetAttribute(event: Event, key: string): Asset {
  const val = getAttributeValue(event, key)
  const obj = JSON.parse(val)

  assert(obj.info != null)
  assert(obj.amount != null)

  return {
    info: getAssetInfo(obj.info),
    amount: BigInt(obj.amount)
  }
}

function getAssetInfo(info: any): AssetInfo {
  if (info.native_token != null) {
    assert(info.native_token.denom != null)
    return {
      type: AssetType.Native,
      identifier: info.native_token.denom,
    }
  }

  if (info.token != null) {
    assert(info.token.contract_addr != null)
    return {
      type: AssetType.CW20,
      identifier: info.token.contract_addr,
    }
  }

  throw new Error(`unknown asset info: ${info}`)
}

interface Asset {
  info: AssetInfo;
  amount: bigint;
}

interface AssetInfo {
  type: AssetType;
  identifier: string;
}

enum AssetType {
  Native,
  CW20
}