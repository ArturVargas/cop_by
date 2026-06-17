// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSquidRouter {
    event Swapped(address indexed token, uint256 amount);

    function swap(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit Swapped(token, amount);
    }

    function fail() external pure {
        revert("mock fail");
    }
}
