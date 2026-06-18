import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CopByPurchaseLogModule = buildModule("CopByPurchaseLogModule", (m) => {
  const logger = m.getAccount(0);
  const purchaseLog = m.contract("CopByPurchaseLog", [logger]);

  return { purchaseLog };
});

export default CopByPurchaseLogModule;
