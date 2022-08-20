const {assert, expect} = require("chai")
const {network, deployments, ethers} = require("hardhat")
const {developmentChains, networkConfig} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Unit Tests", function () {
        let lottery, lotteryContract, vrfCoordinatorV2Mock, lotteryEntranceFee, interval, accounts, player

        beforeEach(async () => {
            accounts = await ethers.getSigners()
            player = accounts[1]
            await deployments.fixture(["all"])
            const {
                abi: vrfCoordinatorV2MockAbi,
                address: vrfCoordinatorV2MockAddress
            } = await deployments.get("VRFCoordinatorV2Mock")
            vrfCoordinatorV2Mock = await ethers.getContractAt(vrfCoordinatorV2MockAbi, vrfCoordinatorV2MockAddress)
            const {abi: lotteryAbi, address: lotteryAddress} = await deployments.get("Lottery")
            lotteryContract = await ethers.getContractAt(lotteryAbi, lotteryAddress)
            lottery = lotteryContract.connect(player)
            lotteryEntranceFee = await lottery.entranceFee()
            interval = await lottery.interval()
        })

        describe("constructor", function () {
            it("initializes the lottery correctly", async () => {
                const lotteryState = await lottery.lotteryState()
                assert.equal(lotteryState.toString(), "0")
                assert.equal(
                    interval.toString(),
                    networkConfig[network.config.chainId]["keepersUpdateInterval"]
                )
            })
        })

        describe("enterLottery", function () {
            it("reverts when you don't pay enough", async () => {
                await expect(lottery.enterLottery()).to.be.revertedWithCustomError(
                    lottery, "Lottery__SendMoreToEnterLottery"
                )
            })
            it("records player when they enter", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                const contractPlayer = await lottery.players(0)
                assert.equal(player.address, contractPlayer)
            })
            it("emits event on enter", async () => {
                await expect(lottery.enterLottery({value: lotteryEntranceFee}))
                    .to.emit(lottery, "LotteryEnter")
            })
            it("doesn't allow entrance when lottery is calculating", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await lottery.performUpkeep([])
                await expect(lottery.enterLottery({value: lotteryEntranceFee}))
                    .to.be.revertedWithCustomError(lottery, "Lottery__LotteryNotOpen")
            })
        })
        describe("checkUpkeep", function () {
            it("returns false if people haven't sent any ETH", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep("0x")
                assert(!upkeepNeeded)
            })
            it("returns false if lottery isn't open", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await lottery.performUpkeep([]) // changes the state to calculating
                const lotteryState = await lottery.lotteryState()
                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep("0x")
                assert.equal(lotteryState.toString() === "1", upkeepNeeded === false)
            })
            it("returns false if enough time hasn't passed", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 2])
                await network.provider.send("evm_mine", [])
                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep("0x")
                assert(!upkeepNeeded)
            })
            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep("0x")
                assert(upkeepNeeded)
            })
        })

        describe("performUpkeep", function () {
            it("can only run if checkUpkeep is true", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const tx = await lottery.performUpkeep("0x")
                assert(tx)
            })
            it("reverts if checkup is false", async () => {
                await expect(lottery.performUpkeep("0x")).to.be.revertedWithCustomError(
                    lottery, "Lottery__UpkeepNotNeeded"
                )
            })
            it("updates the lottery state and emits a requestId", async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const txResponse = await lottery.performUpkeep("0x")
                const txReceipt = await txResponse.wait(1)
                const lotteryState = await lottery.lotteryState()
                const requestId = txReceipt.events[1].args.requestId
                assert(requestId.toNumber() > 0)
                assert(lotteryState === 1) // 0 = open, 1 = calculating
            })
        })
        describe("fulfillRandomWords", function () {
            beforeEach(async () => {
                await lottery.enterLottery({value: lotteryEntranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })
            it("can only be called after performUpkeep", async () => {
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address) // reverts if not fulfilled
                ).to.be.revertedWith("nonexistent request")
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address) // reverts if not fulfilled
                ).to.be.revertedWith("nonexistent request")
            })

            it("picks a winner, resets, and sends money", async () => {
                const additionalEntrances = 3
                const startingIndex = 2
                for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                    lottery = lotteryContract.connect(accounts[i])
                    await lottery.enterLottery({value: lotteryEntranceFee})
                }
                const startingTimeStamp = await lottery.lastTimeStamp()

                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event fired!")
                        try {
                            const recentWinner = await lottery.recentWinner()
                            const lotteryState = await lottery.lotteryState()
                            const winnerBalance = await expectedWinner.getBalance()
                            const endingTimeStamp = await lottery.lastTimeStamp()
                            await expect(lottery.players(0)).to.be.reverted

                            assert.equal(recentWinner.toString(), expectedWinner.address)
                            assert.equal(lotteryState, 0)
                            assert.equal(
                                winnerBalance.toString(),
                                startingBalance
                                    .add(lotteryEntranceFee.mul(1 + additionalEntrances))
                                    .toString()
                            )
                            assert(endingTimeStamp > startingTimeStamp)
                            resolve()
                        } catch (e) {
                            reject(e)
                        }
                    })

                    const tx = await lottery.performUpkeep("0x")
                    const txReceipt = await tx.wait(1)
                    const randomNumber = 10 // Winner index = 10 % 4 == 2 i.e. 3rd player
                    const expectedWinner = accounts[3]
                    const startingBalance = await expectedWinner.getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
                        txReceipt.events[1].args.requestId,
                        lottery.address,
                        [randomNumber]
                    )
                })
            })
        })
    })
