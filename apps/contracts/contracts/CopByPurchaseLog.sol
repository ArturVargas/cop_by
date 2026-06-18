// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CopByPurchaseLog is Ownable {
    address public logger;
    uint256 public totalPurchases;

    event LoggerUpdated(address indexed logger);
    event CopmPurchaseLogged(
        address indexed user,
        bytes32 indexed intentId,
        bytes32 indexed swapTxHash,
        uint256 copmAmount,
        string tokensSpent
    );

    error NotLogger();
    error ZeroLogger();

    constructor(address initialLogger) Ownable(msg.sender) {
        if (initialLogger == address(0)) revert ZeroLogger();
        logger = initialLogger;
        emit LoggerUpdated(initialLogger);
    }

    function setLogger(address nextLogger) external onlyOwner {
        if (nextLogger == address(0)) revert ZeroLogger();
        logger = nextLogger;
        emit LoggerUpdated(nextLogger);
    }

    function logPurchase(
        address user,
        bytes32 intentId,
        bytes32 swapTxHash,
        uint256 copmAmount,
        string calldata tokensSpent
    ) external returns (uint256 purchaseNumber) {
        if (msg.sender != logger) revert NotLogger();

        purchaseNumber = ++totalPurchases;
        emit CopmPurchaseLogged(
            user,
            intentId,
            swapTxHash,
            copmAmount,
            tokensSpent
        );
    }
}
