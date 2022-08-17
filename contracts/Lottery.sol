// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Lottery__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 lotteryState);
error Lottery__TransferFailed();
error Lottery__SendMoreToEnterLottery();
error Lottery__LotteryNotOpen();

contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {

    enum LotteryState {
        OPEN,
        CALCULATING
    }

    // Chainlink VRF Variables
    VRFCoordinatorV2Interface private immutable vrfCoordinator;
    uint64 private immutable subscriptionId;
    bytes32 private immutable keyHash;
    uint32 private immutable callbackGasLimit;
    uint16 public constant REQUEST_CONFIRMATIONS = 3;
    uint32 public constant NUM_WORDS = 1;

    // Lottery Variables
    uint256 public immutable interval;
    uint256 public immutable entranceFee;
    uint256 public lastTimeStamp;
    address public recentWinner;
    address payable[] public players;
    LotteryState public lotteryState;

    /* Events */
    event RequestedLotteryWinner(uint256 indexed requestId);
    event LotteryEnter(address indexed player);
    event WinnerPicked(address indexed player);

    constructor(
        address _vrfCoordinatorV2,
        uint64 _subscriptionId,
        bytes32 _keyHash,
        uint256 _interval,
        uint256 _entranceFee,
        uint32 _callbackGasLimit
    ) VRFConsumerBaseV2(_vrfCoordinatorV2) {
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinatorV2);
        keyHash = _keyHash;
        interval = _interval;
        subscriptionId = _subscriptionId;
        entranceFee = _entranceFee;
        lotteryState = LotteryState.OPEN;
        lastTimeStamp = block.timestamp;
        callbackGasLimit = _callbackGasLimit;
    }

    function enterLottery() public payable {
        if (msg.value < entranceFee) {
            revert Lottery__SendMoreToEnterLottery();
        }
        if (lotteryState != LotteryState.OPEN) {
            revert Lottery__LotteryNotOpen();
        }
        players.push(payable(msg.sender));

        emit LotteryEnter(msg.sender);
    }

    function checkUpkeep(bytes memory /* checkData */) public view override
    returns (
        bool upkeepNeeded,
        bytes memory /* performData */
    ) {
        bool isOpen = LotteryState.OPEN == lotteryState;
        bool timePassed = ((block.timestamp - lastTimeStamp) > interval);
        bool hasPlayers = players.length > 0;
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers);
        return (upkeepNeeded, "0x0");
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded,) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Lottery__UpkeepNotNeeded(
                address(this).balance,
                players.length,
                uint256(lotteryState)
            );
        }
        lotteryState = LotteryState.CALCULATING;
        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            REQUEST_CONFIRMATIONS,
            callbackGasLimit,
            NUM_WORDS
        );

        emit RequestedLotteryWinner(requestId);
    }

    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % players.length;
        address payable _recentWinner = players[indexOfWinner];
        recentWinner = _recentWinner;
        players = new address payable[](0);
        lotteryState = LotteryState.OPEN;
        lastTimeStamp = block.timestamp;
        (bool success,) = recentWinner.call{value : address(this).balance}("");
        if (!success) {
            revert Lottery__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

}
