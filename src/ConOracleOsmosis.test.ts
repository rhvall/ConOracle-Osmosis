// Created by rhvall
// GNU GENERAL PUBLIC LICENSE
// Version 3, 29 June 2007

// Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
// Everyone is permitted to copy and distribute verbatim copies
// of this license document, but changing it is not allowed.

import { ConOracleOsmosis } from './ConOracleOsmosis';
import {
  isReady,
  shutdown,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Signature,
  CircuitString,
  Encoding,
  Poseidon,
} from 'snarkyjs';

import { load } from 'ts-dotenv';

const env = load({
  ENDPOINT: String,
  ORACLE_PUBLIC_KEY: String,
});

let proofsEnabled = false;

function createLocalBlockchain() {
  const Local = Mina.LocalBlockchain({ proofsEnabled });
  Mina.setActiveInstance(Local);
  return Local.testAccounts[0].privateKey;
}

async function localDeploy(
  zkAppInstance: ConOracleOsmosis,
  zkAppPrivatekey: PrivateKey,
  deployerAccount: PrivateKey
) {
  const txn = await Mina.transaction(deployerAccount, () => {
    AccountUpdate.fundNewAccount(deployerAccount);
    zkAppInstance.deploy({ zkappKey: zkAppPrivatekey });
    zkAppInstance.init(zkAppPrivatekey);
  });

  await txn.prove();
  txn.sign([zkAppPrivatekey]);
  await txn.send();
}

describe('ConOracleOsmosis', () => {
  let deployerAccount: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) ConOracleOsmosis.compile();
  });

  beforeEach(async () => {
    deployerAccount = createLocalBlockchain();
    zkAppPrivateKey = PrivateKey.random();
    // console.log("PrivKey:", zkAppPrivateKey.toBase58());
    zkAppAddress = zkAppPrivateKey.toPublicKey();
  });

  afterAll(async () => {
    // `shutdown()` internally calls `process.exit()` which will exit the running Jest process early.
    // Specifying a timeout of 0 is a workaround to defer `shutdown()` until Jest is done running all tests.
    // This should be fixed with https://github.com/MinaProtocol/mina/issues/10943
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `ConOracleOsmosis` smart contract', async () => {
    const zkAppInstance = new ConOracleOsmosis(zkAppAddress);
    await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount);
    const oraclePublicKey = zkAppInstance.oraclePublicKey.get();
    expect(oraclePublicKey).toEqual(
      PublicKey.fromBase58(env.ORACLE_PUBLIC_KEY)
    );
  });

  describe('actual API requests', () => {
    it('emits a `price/token` events containing the data and the provided signature is valid', async () => {
      const zkAppInstance = new ConOracleOsmosis(zkAppAddress);
      await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount);

      const response = await fetch(env.ENDPOINT);
      const respJSON = await response.json();

      const rawData = respJSON.tokens[0];
      const price = new Field(Math.trunc(rawData.price * 100000));
      const token = CircuitString.fromString(rawData.symbol);
      const dataHash = Poseidon.hash(Encoding.stringToFields(rawData));
      const signature = Signature.fromJSON(rawData.signature);

      const txn = await Mina.transaction(deployerAccount, () => {
        zkAppInstance.verifyPrice(
          price,
          token,
          dataHash,
          signature // ?? fail('something is wrong with the signature')
        );
      });

      await txn.prove();
      await txn.send();

      const events = await zkAppInstance.fetchEvents();
      console.log('Events: ', events);
      const hash = events[0].event.toFields(null)[0];
      // const priceEvent = events[1].event.toFields(null)[0];
      // expect(priceEvent).toEqual(price);
      expect(hash).toEqual(dataHash);
    });

    //   it('throws an error if the credit score is below 700 even if the provided signature is valid', async () => {
    //     const zkAppInstance = new ConOracleOsmosis(zkAppAddress);
    //     await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount);

    //     const response = await fetch(
    //       'https://mina-credit-score-signer-pe3eh.ondigitalocean.app/user/2'
    //     );
    //     const data = await response.json();

    //     const id = Field(data.data.id);
    //     const creditScore = Field(data.data.creditScore);
    //     const signature = Signature.fromJSON(data.signature);

    //     expect(async () => {
    //       await Mina.transaction(deployerAccount, () => {
    //         zkAppInstance.verify(
    //           id,
    //           creditScore,
    //           signature ?? fail('something is wrong with the signature')
    //         );
    //       });
    //     }).rejects;
    //   });
    // });

    // describe('hardcoded values', () => {
    //   it('emits an `id` event containing the users id if their credit score is above 700 and the provided signature is valid', async () => {
    //     const zkAppInstance = new ConOracleOsmosis(zkAppAddress);
    //     await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount);

    //     const id = Field(1);
    //     const creditScore = Field(787);
    //     const signature = Signature.fromJSON({
    //       r: '13209474117923890467777795933147746532722569254037337512677934549675287266861',
    //       s: '12079365427851031707052269572324263778234360478121821973603368912000793139475',
    //     });

    //     const txn = await Mina.transaction(deployerAccount, () => {
    //       zkAppInstance.verify(
    //         id,
    //         creditScore,
    //         signature ?? fail('something is wrong with the signature')
    //       );
    //     });
    //     await txn.prove();
    //     await txn.send();

    //     const events = await zkAppInstance.fetchEvents();
    //     const verifiedEventValue = events[0].event.toFields(null)[0];
    //     expect(verifiedEventValue).toEqual(id);
    //   });

    //   it('throws an error if the credit score is below 700 even if the provided signature is valid', async () => {
    //     const zkAppInstance = new ConOracleOsmosis(zkAppAddress);
    //     await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount);

    //     const id = Field(2);
    //     const creditScore = Field(536);
    //     const signature = Signature.fromJSON({
    //       r: '25163915754510418213153704426580201164374923273432613331381672085201550827220',
    //       s: '20455871399885835832436646442230538178588318835839502912889034210314761124870',
    //     });

    //     expect(async () => {
    //       await Mina.transaction(deployerAccount, () => {
    //         zkAppInstance.verify(
    //           id,
    //           creditScore,
    //           signature ?? fail('something is wrong with the signature')
    //         );
    //       });
    //     }).rejects;
    //   });

    //   it('throws an error if the credit score is above 700 and the provided signature is invalid', async () => {
    //     const zkAppInstance = new ConOracleOsmosis(zkAppAddress);
    //     await localDeploy(zkAppInstance, zkAppPrivateKey, deployerAccount);

    //     const id = Field(1);
    //     const creditScore = Field(787);
    //     const signature = Signature.fromJSON({
    //       r: '26545513748775911233424851469484096799413741017006352456100547880447752952428',
    //       s: '7381406986124079327199694038222605261248869991738054485116460354242251864564',
    //     });

    //     expect(async () => {
    //       await Mina.transaction(deployerAccount, () => {
    //         zkAppInstance.verify(
    //           id,
    //           creditScore,
    //           signature ?? fail('something is wrong with the signature')
    //         );
    //       });
    //     }).rejects;
    //   });
  });
});
