import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CopByPurchaseLogModule = buildModule("CopByPurchaseLogModule", (m) => {
  const logger = m.getParameter(
    "logger",
    "0x1f4D4b2820670B8ce7cC4E709fa06fa783F029d2"
  );
  const purchaseLog = m.contract("CopByPurchaseLog", [logger]);

  return { purchaseLog };
});

export default CopByPurchaseLogModule;
