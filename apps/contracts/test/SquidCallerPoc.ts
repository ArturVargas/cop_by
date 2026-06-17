import { expect } from "chai";
import hre from "hardhat";
import { encodeFunctionData, parseUnits } from "viem";

describe("SquidCallerPoc", function () {
  it("approves and calls the squid router calldata", async function () {
    const token = await hre.viem.deployContract("MockERC20");
    const router = await hre.viem.deployContract("MockSquidRouter");
    const poc = await hre.viem.deployContract("SquidCallerPoc");
    const amount = parseUnits("1", 18);

    await token.write.mint([poc.address, amount]);

    const data = encodeFunctionData({
      abi: router.abi,
      functionName: "swap",
      args: [token.address, amount],
    });

    const hash = await poc.write.execute([
      token.address,
      router.address,
      amount,
      data,
    ]);
    await (await hre.viem.getPublicClient()).waitForTransactionReceipt({ hash });

    expect(await token.read.balanceOf([router.address])).to.equal(amount);
    expect(await poc.getEvents.SquidExecuted()).to.have.lengthOf(1);
  });

  it("reverts when the router call fails", async function () {
    const token = await hre.viem.deployContract("MockERC20");
    const router = await hre.viem.deployContract("MockSquidRouter");
    const poc = await hre.viem.deployContract("SquidCallerPoc");
    const amount = parseUnits("1", 18);

    const data = encodeFunctionData({
      abi: router.abi,
      functionName: "fail",
    });

    await expect(
      poc.write.execute([token.address, router.address, amount, data])
    ).to.be.rejectedWith("SquidCallFailed");
  });
});
