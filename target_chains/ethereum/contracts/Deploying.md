# Deploying Contracts to Production

## EVM network configuration

Each network that Pyth is deployed on has some configuration stored on this repo in the contract manager package as described below:

1. Chain configuration in [EvmChains.yaml](../../../contract_manager/store/chains/EvmChains.yaml) contains:
   - `id`: id of the chain. This will be used for identifying which chain we want to deploy to.
   - `wormholeChainName`: Chain name in Wormhole. It is either defined in the
     [Wormhole SDK constants](https://github.com/wormhole-foundation/wormhole/blob/dev.v2/sdk/js/src/utils/consts.ts)
     or is defined in [Wormhole Receiver names](../../../governance/xc_admin/packages/xc_admin_common/src/chains.ts). If the new
     network requires a Receiver contract you need to update the latter file and add the network there.
   - `mainnet`: A boolean which indicates whether the network is `mainnet` or `testnet`/`devnet`.
   - `rpcUrl`: RPC endpoint of the network.
   - `networkId`: id of the network. Used in RPC calls.
2. Contract configuration in [EvmContracts.yaml](../../../contract_manager/store/contracts/EvmContracts.yaml) contains:
   - `address`: The address the pyth contract is deployed on (this will refer to the proxy contract).
   - `chain`: Name of the chain (`id` field in chain configuration) the contract is deployed on.

If you wish to deploy to a new network you need to add the chain configurations as described above. You can find `networkId` and public
RPCs of most of the networks in [ChainList](https://chainlist.org/). Rest of the parameters are optional and avoid
adding them unless it is necessary. Wormhole's
[truffle-config.js](https://github.com/wormhole-foundation/wormhole/blob/main/ethereum/truffle-config.js)
is a good reference too.

## Deployment

This is the deployment process:

1. Follow the installation instructions in the [README.md](./README.md).
2. As a sanity check on deploying changes for the first time, it is recommended to deploy the migrations
   in `migrations/prod` to the Truffle `development` network first. You can do this by using the configuration
   values in [`.env.prod.development`](.env.prod.development).
3. If you have changed the contract make sure that:
   - The change is not breaking the storage.
   - If it is making a backward incompatible change, the legacy methods/storages are still used. For example,
     if the PriceInfos are now stored in a separate storage slot, the old PriceInfo should be accessible when
     the new one is not populated.
   - the contract version is updated both in [`Pyth.sol`](./contracts/pyth/Pyth.sol) and [`package.json`](./package.json).
     Make sure to read the [Upgrading the contract](#upgrading-the-contract) and [Versioning](#versioning)
     sections below.
4. Prepare the required keys for deployment. You can find more information about them on notion. Then:
   - Export the secret recovery phrase for the deployment account. Please store it in a file and read
     the file into `MNEMONIC` environment variable like so: `export MNEMONIC=$(cat path/to/mnemonic)`.
5. Make sure the deployment account has proper balance on this network and top it up if needed. Search
   for testnet faucets if it is a testnet network. Sometimes you need to bridge the network token (e.g., L2s).
6. Add the required chain configuration in the contract manager file [EvmChains.yaml](../../../contract_manager/store/chains/EvmChains.yaml)
7. Deploy the new contract or changes using the [`deploy.sh`](./deploy.sh) script.
   You might need to repeat this script because of busy RPCs. Repeating would not cause any problem even
   if the changes are already made. Also, sometimes the gases are not adjusted and it will cause the tx to
   remain on the mempool for a long time (so there is no progress until timeout). Please update them with
   the network explorer gas tracker. Tips in the [Troubleshooting](#troubleshooting) section below can help
   in case of any error. Run the script like this: `./deploy.sh <network_a> <network_b> <...>`. For example
   to deploy changes to testnet networks you can run:
   ```bash
   ./deploy.sh bnb_testnet fantom_testnet mumbai
   ```
8. On first time deployments for a **mainnet** network with Wormhole Receiver contract, run this command:
   ```bash
   npm run receiver-submit-guardian-sets -- --network <network>
   ```
9. As a result of this process for some files (with the network id in their name) in `networks` and directory might change
   which need to be committed (if they are result of a production deployment). Create a PR for them.
10. If you are deploying to a new network, please add the new contract address to consumer facing libraries
    and documentations. The deployment script should automatically add the contract to the contract manager store. Please update the following resources:
    - [Pyth Gitbook EVM Page](https://github.com/pyth-network/documentation/blob/main/pages/documentation/pythnet-price-feeds/evm.mdx)
    - [pyth-evm-js package](../sdk/js/)
11. (Optional) You can test the deployed contract by sending and fetching a price update as described in the
    [Testing](#testing) section below.
12. (Optional) Verify the contract as described in the [Verifying the contract](#verifying-the-contract) section.

### `networks` directory

Truffle stores the address of the deployed contracts in the build artifacts, which can make local development difficult. We use [`truffle-deploy-registry`](https://github.com/MedXProtocol/truffle-deploy-registry) to store the addresses separately from the artifacts, in the [`networks`](networks) directory. When we need to perform operations on the deployed contracts, such as performing additional migrations, we can run `npx apply-registry` to populate the artifacts with the correct addresses.

Each file in the network directory is named after the network id and contains address of Migration contract and PythUpgradable contract
(and Wormhole Receiver if we use `prod-receiver`). If you are upgrading the contract it should not change. In case you are deploying to a new network make sure to commit this file.

### Upgrading the contract

To upgrade the contract you should bump the version of the contract and the npm package to the new version and run the deployment
process described above. Please bump the version properly as described in [the section below](#versioning).

**When you are making changes to the storage, please make sure that your change to the contract won't cause any collision**. For example:

- Renaming a variable is fine.
- Changing a variable type to another type with the same size is ok.
- Appending to the contract variables is ok. If the last variable is a struct, it is also fine
  to append to that struct.
- Appending to a mapping value is ok as the contract stores mapping values in a random (hashed) location.

Anything other than the operations above will probably cause a collision. Please refer to Open Zeppelin Upgradeable
(documentations)[https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable] for more information.

### Upgrading the Wormhole guardian set in the Wormhole receiver contracts

If the Wormhole guardian set is going to change, you need to update the guardian set in the Wormhole receiver
contracts. You should do it before the guardians start publishing VAAs with the new guardian set and not earlier than 24 hours before that
to avoid any possible downtime. After updating the guardian set there is a 24 hour windows that the contracts
will accept VAAs from both the old and the new index. So, you will need to do it when you are certain that Guardians
will start publishing with the new set soon.

To update the guardian set update the
[`receiverSubmitGuardianSetUpgrades.js`](./scripts/receiverSubmitGuardianSetUpgrades.js) script and add the new VAA and comment out the previous upgrades.
Then, run it like below on the networks with Wormhole receiver contract:

```
npm run receiver-submit-guardian-sets -- --network <network>
```

You should create a PR to add this VAA to the repo for future deployments on new networks with Wormhole receiver contract.

### Versioning

We use [Semantic Versioning](https://semver.org/) for our releases. When upgrading the contract, update the npm package version using
`npm version <new version number> --no-git-tag-version`. Also, modify the hard-coded value in `version()` method in
[the `Pyth.sol` contract](./contracts/pyth/Pyth.sol) to the new version. Then, after your PR is merged in main, create a release like with tag `pyth-evm-contract-v<x.y.z>`. This will help developers to be able to track code changes easier.

# Testing

The [pyth-js][] repository contains an example with documentation and a code sample showing how to relay your own prices to a
target Pyth network. Once you have relayed a price, you can verify the price feed has been updated by doing:

```
$ npx truffle console --network $MIGRATIONS_NETWORK
> let p = await PythUpgradable.deployed()
> p.queryPriceFeed("0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b") // BTC Testnet or any other address
```

[pyth-js]: https://github.com/pyth-network/pyth-js/tree/main/pyth-evm-js#evmrelay

# Contract verification

## Creating verification assets for a new release

We include artifacts required for verifying the contract in each release. To create these artifacts, run the following commands:

```
npx sol-merger contracts/pyth/PythUpgradable.sol
npx sol-merger contracts/pyth/ReceiverImplementation.sol
npx truffle run stdjsonin PythUpgradable
npx truffle run stdjsonin ReceiverImplementation
```

These commands create the files `contracts/pyth/PythUpgradable_merged.sol`, `contracts/pyth/ReceiverImplementation_merged.sol`, `PythUpgradable-input.json`, and `ReceiverImplementation-input.json` respectively.
The `.sol` files are the flattened version of the contracts, and the `.json` files are the standard json input of the contracts.

Please include all of these in the release.

## Verifying the contract

Read [VERIFY.md](./VERIFY.md) for how to use these files to verify the contract.

# Troubleshooting

- If you get `digital envelope routines::unsupported` error, it means you are using a new Node version and it does not work because
  the truffle dependency is old. As a workaround, you can use the legacy openssl implementation by running this command:
  `export NODE_OPTIONS=--openssl-legacy-provider`.
- Sometimes the truffle might fail during the dry-run (e.g., in Ethereum). It is because openzeppelin does not have the required metadata for forking. To fix it please
  follow the suggestion [here](https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/241#issuecomment-1192657444).
- Sometimes due to rpc problems or insufficient gas the migration is not executed completely. It is better to avoid doing multiple transactions in one
  migration. However, if it happens, you can comment out the part that is already ran (you can double check in the explorer), and re-run the migration.
  You can avoid gas problems by choosing a much higher gas than what is showed on the network gas tracker. Also, you can find other rpc nodes from
  [here](https://chainlist.org/)

# Deploy/Upgrade on zkSync networks

Although zkSync is EVM compatible, their binary format is different than solc output. So, we need to use their libraries to
compile it to their binary format (zk-solc) and deploy it. As of this writing they only support hardhat. To deploy a fresh
contract or a new contract do the following steps in addition to the steps described above:

1. Update the [`hardhad.config.ts`](./hardhat.config.ts) file.
2. Add the required chain configuration in the contract manager files as described above.
3. Run `npx hardhat clean && npx hardhat compile` to have a clean compile the contracts.
4. Prepare the enviornment:

- Export the secret recovery phrase for the deployment account. Please store it in a file and read
  the file into `MNEMONIC` environment variable like so: `export MNEMONIC=$(cat path/to/mnemonic)`.
- Create the env settings by running `node create-env.js zksync` and verifying the `.env` file.

5. If you wish to deploy the contract run `npx hardhat deploy-zksync --network <network> --script deploy/zkSyncDeploy` to deploy it to the new network. Otherwise
   run `npx hardhat deploy-zksync --network <network> --script deploy/zkSyncDeployNewPythImpl.ts` to get a new implementation address. Then put it in
   `.<network>.new_impl` file and run the deployment script to handle the rest of the changes.

# Deploy/Upgrade on Canto

Canto network rewards some percentage of the gas usage to the contracts. To enable the rewards we have modified the contract upon
deployment to register its own address as the receiver of the rewards and also assigned Pyth to received Wormhole Receiver rewards
too. The registration only happens once for contract. The contracts are registered with token id 654. We don't need to register
the contracts upon upgrades because the proxy address doesn't change. The contract changes for registration are stored in
[this diff](./canto-deployment-patch.diff) for future reference. Please note that if we switch to another Wormhole Receiver
(a new address) we will need to register the new contract.
