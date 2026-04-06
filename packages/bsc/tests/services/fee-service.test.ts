import { describe, it, expect, vi } from "vitest";
import { getAddress } from "viem";
import { FeeService } from "../../src/smartchain/services/fee-service";
import { ValidationError, ValidationErrorCode } from "@guardian/sdk";
import { BSC_CHAIN } from "../../src/chain";
import gasPriceFixture from "../fixtures/eth_gasPrice.json";
import estimateGasFixture from "../fixtures/eth_estimateGas.json";

// Real BSC mainnet responses: eth_gasPrice and eth_estimateGas
const REAL_GAS_PRICE = BigInt(gasPriceFixture.result);
const REAL_GAS_ESTIMATE = BigInt(estimateGasFixture.result);

const OPERATOR = getAddress("0x773760b0708a5cc369c346993a0c225d8e4043b1");
const VALIDATOR = { operatorAddress: OPERATOR, creditAddress: getAddress("0x4afc633e7b6beb8e552ccddbe06cca3754991e9a") } as any;

function makePublicClient(gasPrice = REAL_GAS_PRICE, gasEstimate = REAL_GAS_ESTIMATE) {
  return {
    getGasPrice: vi.fn().mockResolvedValue(gasPrice),
    estimateGas: vi.fn().mockResolvedValue(gasEstimate),
  };
}

function makeSignService(callData = { data: "0x" as `0x${string}`, amount: 0n }) {
  return { buildCallData: vi.fn().mockResolvedValue(callData) };
}

describe("FeeService", () => {
  it("estimates fee with 15% buffer and correct total", async () => {
    const service = new FeeService(makePublicClient() as any, makeSignService() as any);

    const fee = await service.estimateFee({
      type: "Undelegate",
      chain: BSC_CHAIN,
      amount: 1_000_000_000_000_000_000n,
      isMaxAmount: false,
      validator: VALIDATOR,
      account: OPERATOR,
    });

    const expectedLimit = (REAL_GAS_ESTIMATE * 115n) / 100n;
    expect(fee.type).toBe("GasFee");
    expect(fee.gasPrice).toBe(REAL_GAS_PRICE);
    expect(fee.gasLimit).toBe(expectedLimit);
    expect(fee.total).toBe(REAL_GAS_PRICE * expectedLimit);
  });

  it("passes calldata to estimateGas", async () => {
    const callData = { data: "0xdeadbeef" as `0x${string}`, amount: 500n };
    const client = makePublicClient();
    const service = new FeeService(client as any, makeSignService(callData) as any);

    await service.estimateFee({
      type: "Delegate",
      chain: BSC_CHAIN,
      amount: 500n,
      isMaxAmount: false,
      validator: VALIDATOR,
      account: OPERATOR,
    });

    expect(client.estimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ data: callData.data, value: callData.amount })
    );
  });

  it("throws when account address is missing", async () => {
    const service = new FeeService(makePublicClient() as any, makeSignService() as any);

    await expect(
      service.estimateFee({
        type: "Delegate",
        chain: BSC_CHAIN,
        amount: 1_000_000_000_000_000_000n,
        isMaxAmount: false,
        validator: VALIDATOR,
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe(ValidationErrorCode.INVALID_ADDRESS);
      return true;
    });
  });
});
