import { expect } from "chai";
import hre from "hardhat";
import { encodePacked, getAddress, keccak256, parseUnits, zeroAddress } from "viem";

describe("CopByPurchaseLog", function () {
  it("lets only the logger record purchases", async function () {
    const [logger, otherAccount] = await hre.viem.getWalletClients();
    const purchaseLog = await hre.viem.deployContract("CopByPurchaseLog", [
      logger.account.address,
    ]);
    const intentId = keccak256(encodePacked(["string"], ["intent-1"]));
    const swapTxHash = keccak256(encodePacked(["string"], ["tx-1"]));

    const hash = await purchaseLog.write.logPurchase([
        logger.account.address,
        intentId,
        swapTxHash,
        parseUnits("5000", 18),
        "USDC:1.45",
      ]);
    await (await hre.viem.getPublicClient()).waitForTransactionReceipt({ hash });

    const purchaseLogAsOther = await hre.viem.getContractAt(
      "CopByPurchaseLog",
      purchaseLog.address,
      { client: { wallet: otherAccount } }
    );

    await expect(
      purchaseLogAsOther.write.logPurchase([
        otherAccount.account.address,
        intentId,
        swapTxHash,
        1n,
        "USDT:1",
      ])
    ).to.be.rejectedWith("NotLogger");

    expect(await purchaseLog.read.totalPurchases()).to.equal(1n);
  });

  it("lets owner rotate logger", async function () {
    const [owner, nextLogger] = await hre.viem.getWalletClients();
    const purchaseLog = await hre.viem.deployContract("CopByPurchaseLog", [
      owner.account.address,
    ]);

    await purchaseLog.write.setLogger([nextLogger.account.address]);
    expect(await purchaseLog.read.logger()).to.equal(
      getAddress(nextLogger.account.address)
    );

    await expect(purchaseLog.write.setLogger([zeroAddress])).to.be.rejectedWith(
      "ZeroLogger"
    );
  });
});
