const networkConfig = {
    31337: {
        name: "localhost",
        subscriptionId: "1", // Any value here
        keyHash: "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
        keepersUpdateInterval: "30",
        lotteryEntranceFee: "100000000000000000", // 0.1 ETH
        callbackGasLimit: "500000"
    },
    4: {
        name: "rinkeby",
        subscriptionId: "10572",
        keyHash: "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
        keepersUpdateInterval: "30",
        lotteryEntranceFee: "100000000000000000", // 0.1 ETH
        callbackGasLimit: "500000",
        vrfCoordinatorV2: "0x6168499c0cFfCaCD319c818142124B7A15E857ab",
    },
}

const developmentChains = ["hardhat", "localhost"]

module.exports = {
    networkConfig,
    developmentChains
}