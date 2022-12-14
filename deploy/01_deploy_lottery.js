const {network, ethers} = require("hardhat")
const {networkConfig, developmentChains} = require("../helper-hardhat-config")
const {verify} = require("../utils/verify")

const FUND_AMOUNT = ethers.utils.parseEther("100")

module.exports = async ({getNamedAccounts, deployments}) => {
    const {deploy, log} = deployments
    const {deployer} = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Mock, vrfCoordinatorV2Address, subscriptionId

    if (chainId === 31337) {
        // create VRFV2 Subscription
        const {abi, address} = await deployments.get("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Mock = await ethers.getContractAt(abi, address)
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        subscriptionId = transactionReceipt.events[0].args.subId
        // Fund the subscription
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }
    const waitBlockConfirmations = network.config.blockConfirmations || 1

    log("----------------------------------------------------")
    const arguments = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId]["keyHash"],
        networkConfig[chainId]["keepersUpdateInterval"],
        networkConfig[chainId]["lotteryEntranceFee"],
        networkConfig[chainId]["callbackGasLimit"],
    ]
    const lottery = await deploy("Lottery", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    if(chainId === 31337) {
        vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)
    }

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(lottery.address, arguments)
    }

    log("Enter lottery with command:")
    const networkName = network.name === "hardhat" ? "localhost" : network.name
    log(`yarn hardhat run scripts/enterLottery.js --network ${networkName}`)
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "lottery"]
