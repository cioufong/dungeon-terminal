// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @dev Mock Binance Oracle VRF Coordinator for testing.
 *      Simulates requestRandomWords + fulfillment callback.
 */
contract MockVRFCoordinator {
    uint256 private _nextRequestId;

    struct Request {
        address consumer;
        bool exists;
    }

    mapping(uint256 => Request) public requests;

    event RandomWordsRequested(uint256 indexed requestId, address indexed consumer);

    function requestRandomWords(
        bytes32,
        uint64,
        uint16,
        uint32,
        uint32
    ) external returns (uint256) {
        _nextRequestId++;
        requests[_nextRequestId] = Request(msg.sender, true);
        emit RandomWordsRequested(_nextRequestId, msg.sender);
        return _nextRequestId;
    }

    function lastRequestId() external view returns (uint256) {
        return _nextRequestId;
    }

    /**
     * @dev Test helper: fulfill a VRF request with given random words.
     *      Calls rawFulfillRandomWords on the consumer contract.
     */
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        Request memory req = requests[requestId];
        require(req.exists, "Request not found");
        delete requests[requestId];

        (bool success, bytes memory data) = req.consumer.call(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                randomWords
            )
        );
        if (!success) {
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert("Fulfill failed");
        }
    }

    /**
     * @dev Convenience: fulfill with a single seed value.
     */
    function fulfillWithSeed(uint256 requestId, uint256 seed) external {
        uint256[] memory words = new uint256[](1);
        words[0] = seed;

        Request memory req = requests[requestId];
        require(req.exists, "Request not found");
        delete requests[requestId];

        (bool success, bytes memory data) = req.consumer.call(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                words
            )
        );
        if (!success) {
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert("Fulfill failed");
        }
    }
}
