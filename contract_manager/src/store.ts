import {
  AptosChain,
  Chain,
  CosmWasmChain,
  EvmChain,
  GlobalChain,
  SuiChain,
} from "./chains";
import {
  AptosContract,
  CosmWasmContract,
  EvmContract,
  SuiContract,
} from "./contracts";
import { Contract } from "./base";
import { parse, stringify } from "yaml";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { Vault } from "./governance";

export class Store {
  public chains: Record<string, Chain> = { global: new GlobalChain() };
  public contracts: Record<string, Contract> = {};
  public vaults: Record<string, Vault> = {};

  constructor(public path: string) {
    this.loadAllChains();
    this.loadAllContracts();
    this.loadAllVaults();
  }

  static serialize(obj: Contract | Chain | Vault) {
    return stringify([obj.toJson()]);
  }

  getYamlFiles(path: string) {
    const walk = function (dir: string) {
      let results: string[] = [];
      const list = readdirSync(dir);
      list.forEach(function (file) {
        file = dir + "/" + file;
        const stat = statSync(file);
        if (stat && stat.isDirectory()) {
          // Recurse into a subdirectory
          results = results.concat(walk(file));
        } else {
          // Is a file
          results.push(file);
        }
      });
      return results;
    };
    return walk(path).filter((file) => file.endsWith(".yaml"));
  }

  loadAllChains() {
    let allChainClasses = {
      [CosmWasmChain.type]: CosmWasmChain,
      [SuiChain.type]: SuiChain,
      [EvmChain.type]: EvmChain,
      [AptosChain.type]: AptosChain,
    };

    this.getYamlFiles(`${this.path}/chains/`).forEach((yamlFile) => {
      let parsedArray = parse(readFileSync(yamlFile, "utf-8"));
      for (const parsed of parsedArray) {
        if (allChainClasses[parsed.type] === undefined) return;
        let chain = allChainClasses[parsed.type].fromJson(parsed);
        if (this.chains[chain.getId()])
          throw new Error(`Multiple chains with id ${chain.getId()} found`);
        this.chains[chain.getId()] = chain;
      }
    });
  }

  saveAllContracts() {
    let contractsByType: Record<string, Contract[]> = {};
    for (const contract of Object.values(this.contracts)) {
      if (!contractsByType[contract.getType()]) {
        contractsByType[contract.getType()] = [];
      }
      contractsByType[contract.getType()].push(contract);
    }
    for (const [type, contracts] of Object.entries(contractsByType)) {
      writeFileSync(
        `${this.path}/contracts/${type}s.yaml`,
        stringify(contracts.map((c) => c.toJson()))
      );
    }
  }

  saveAllChains() {
    let chainsByType: Record<string, Chain[]> = {};
    for (const chain of Object.values(this.chains)) {
      if (!chainsByType[chain.getType()]) {
        chainsByType[chain.getType()] = [];
      }
      chainsByType[chain.getType()].push(chain);
    }
    for (const [type, chains] of Object.entries(chainsByType)) {
      writeFileSync(
        `${this.path}/chains/${type}s.yaml`,
        stringify(chains.map((c) => c.toJson()))
      );
    }
  }

  loadAllContracts() {
    let allContractClasses = {
      [CosmWasmContract.type]: CosmWasmContract,
      [SuiContract.type]: SuiContract,
      [EvmContract.type]: EvmContract,
      [AptosContract.type]: AptosContract,
    };
    this.getYamlFiles(`${this.path}/contracts/`).forEach((yamlFile) => {
      let parsedArray = parse(readFileSync(yamlFile, "utf-8"));
      for (const parsed of parsedArray) {
        if (allContractClasses[parsed.type] === undefined) return;
        if (!this.chains[parsed.chain])
          throw new Error(`Chain ${parsed.chain} not found`);
        const chain = this.chains[parsed.chain];
        let chainContract = allContractClasses[parsed.type].fromJson(
          chain,
          parsed
        );
        if (this.contracts[chainContract.getId()])
          throw new Error(
            `Multiple contracts with id ${chainContract.getId()} found`
          );
        this.contracts[chainContract.getId()] = chainContract;
      }
    });
  }

  loadAllVaults() {
    this.getYamlFiles(`${this.path}/vaults/`).forEach((yamlFile) => {
      let parsedArray = parse(readFileSync(yamlFile, "utf-8"));
      for (const parsed of parsedArray) {
        if (parsed.type !== Vault.type) return;

        const vault = Vault.fromJson(parsed);
        if (this.vaults[vault.getId()])
          throw new Error(`Multiple vaults with id ${vault.getId()} found`);
        this.vaults[vault.getId()] = vault;
      }
    });
  }
}

export const DefaultStore = new Store(`${__dirname}/../store`);
