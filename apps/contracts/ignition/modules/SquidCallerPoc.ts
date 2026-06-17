import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SquidCallerPocModule = buildModule("SquidCallerPocModule", (m) => {
  const squidCallerPoc = m.contract("SquidCallerPoc");

  return { squidCallerPoc };
});

export default SquidCallerPocModule;
