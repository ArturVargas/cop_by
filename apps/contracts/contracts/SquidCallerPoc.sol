// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SquidCallerPoc {
    event SquidExecuted(
        address indexed token,
        address indexed squidRouter,
        uint256 amount
    );

    error SquidCallFailed(bytes result);

    function execute(
        address token,
        address squidRouter,
        uint256 amount,
        bytes calldata squidData
    ) external payable {
        IERC20(token).approve(squidRouter, amount);

        (bool ok, bytes memory result) = squidRouter.call{value: msg.value}(
            squidData
        );
        if (!ok) revert SquidCallFailed(result);

        emit SquidExecuted(token, squidRouter, amount);
    }
}
