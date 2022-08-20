const {assert, expect} = require("chai")
const {getNamedAccounts, deployments, ethers, network} = require("hardhat")
const {developmentChains} = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Staging Tests", function () {
        let lottery, lotteryEntranceFee, deployer

        beforeEach(async function () {
            deployer = (await getNamedAccounts()).deployer
            const {abi, address} = await deployments.get("Lottery")
            lottery = await ethers.getContractAt(abi, address)
            lotteryEntranceFee = await lottery.entranceFee()
        })

        describe("fulfillRandomWords", function () {
            it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                // enter the lottery
                console.log("Setting up test...")
                const startingTimeStamp = await lottery.lastTimeStamp()
                const accounts = await ethers.getSigners()

                console.log("Setting up Listener...")
                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event fired!")
                        try {
                            const recentWinner = await lottery.recentWinner()
                            const lotteryState = await lottery.lotteryState()
                            const winnerEndingBalance = await accounts[0].getBalance()
                            const endingTimeStamp = await lottery.lastTimeStamp()

                            await expect(lottery.players(0)).to.be.reverted
                            assert.equal(recentWinner.toString(), accounts[0].address)
                            assert.equal(lotteryState, 0)
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(lotteryEntranceFee).toString()
                            )
                            assert(endingTimeStamp > startingTimeStamp)
                            resolve()
                        } catch (error) {
                            console.log(error)
                            reject(error)
                        }
                    })
                    console.log("Entering Lottery...")
                    const tx = await lottery.enterLottery({value: lotteryEntranceFee})
                    await tx.wait(1)
                    const winnerStartingBalance = await accounts[0].getBalance()
                    console.log("Ok, time to wait...")
                })
            })
        })
    })
