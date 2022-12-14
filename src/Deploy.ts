/**
 * This is an example for interacting with the Berkeley QANet, directly from snarkyjs.
 *
 * At a high level, it does the following:
 * -) try fetching the account corresponding to the `zkappAddress` from chain
 * -) if the account doesn't exist or is not a zkapp account yet, deploy a zkapp to it and initialize on-chain state
 * -) if the zkapp is already deployed, send a state-updating transaction which proves execution of the "update" method
 */

import {
  Field,
  CircuitString,
  Poseidon,
  Signature,
  PrivateKey,
  Encoding,
  Mina,
  AccountUpdate,
  isReady,
  shutdown,
  fetchAccount,
} from 'snarkyjs';

import { ConOracleOsmosis } from './ConOracleOsmosis.js';

import { load } from 'ts-dotenv';

const env = load({
  ENDPOINT: String,
  MINANETWORK: String,
  ORACLE_PUBLIC_KEY: String,
  PRIVKEY: String,
  APPPRIV: String,
});

await isReady;

// you can use this with any spec-compliant graphql endpoint
let Berkeley = Mina.Network(env.MINANETWORK);
Mina.setActiveInstance(Berkeley);

// to use this test, change this private key to an account which has enough MINA to pay fees
let feePayerKey = PrivateKey.fromBase58(env.PRIVKEY);
let response = await fetchAccount({ publicKey: feePayerKey.toPublicKey() });

if (response.error) {
  throw Error(response.error.statusText);
}

let { nonce, balance } = response.account;
console.log(`Using fee payer account with nonce ${nonce}, balance ${balance}`);

// this is an actual zkapp that was deployed and updated with this script:
// https://berkeley.minaexplorer.com/wallet/B62qk5PqWzMRNnf7kGGTZpcNvqwhVu7bwnPjgk7FuxRQoYU12mBJtfc
// replace this with a new zkapp key if you want to deploy another zkapp
// and please never expose actual private keys in public code repositories like this!
let zkappKey = PrivateKey.fromBase58(env.APPPRIV);
let zkappAddress = zkappKey.toPublicKey();

let transactionFee = 100_000_000;

// compile the SmartContract to get the verification key (if deploying) or cache the provers (if updating)
// this can take a while...
console.log('Compiling smart contract...');
// let { verificationKey } = await ConOracleOsmosis.compile();
await ConOracleOsmosis.compile();

// check if the zkapp is already deployed, based on whether the account exists and its first zkapp state is != 0
let zkapp = new ConOracleOsmosis(zkappAddress);
let x = await zkapp.oraclePublicKey.fetch();
let isDeployed = x?.isEmpty() ?? false;
let isSame = x?.equals(feePayerKey.toPublicKey());
console.log('Pub: ', x?.toBase58(), ' Eq:', isSame);

// if the zkapp is not deployed yet, create a deploy transaction
if (!isDeployed) {
  console.log(`Deploying zkapp for public key: ${zkappAddress.toBase58()}`);
  // the `transaction()` interface is the same as when testing with a local blockchain
  let transaction = await Mina.transaction(
    { feePayerKey, fee: transactionFee },
    () => {
      AccountUpdate.fundNewAccount(feePayerKey);
      zkapp.deploy({ zkappKey });
      zkapp.init(feePayerKey);
    }
  );

  let signed = transaction.sign([feePayerKey, zkappKey]);
  // if you want to inspect the transaction, you can print it out:
  // console.log(transaction.toGraphqlQuery());

  // send the transaction to the graphql endpoint
  console.log('Sending deploy transaction...');
  let res = await signed.send();
  console.log('Transaction: ', res);
} else {
  console.log('Already deployed, checking the verify function');

  const response = await fetch(env.ENDPOINT);
  const respJSON = await response.json();

  console.log('RespJSON received');
  const rawData = respJSON.tokens[0];
  const price = new Field(Math.trunc(rawData.price * 100000));
  const token = CircuitString.fromString(rawData.symbol);
  const dataHash = Poseidon.hash(Encoding.stringToFields(rawData));
  const signature = Signature.fromJSON(rawData.signature);

  console.log(`Checking: ${token}@${price}`);

  const txn = await Mina.transaction(
    { feePayerKey, fee: transactionFee },
    () => {
      zkapp.verifyPrice(
        price,
        token,
        dataHash,
        signature //?? fail('something is wrong with the signature')
      );
    }
  );

  console.log(`Proving...`);
  await txn.prove();

  console.log(`Sending...`);
  let res = await txn.send();
  console.log('Result:', res);
  // console.log("Events...");
  // const events = await zkapp.fetchEvents();
  // console.log("Events: ", events);
  // const tokenEvent = events[0].event;
  // const priceEvent = events[1].event.toFields(null)[0];
  // console.log("TokenEvent:", tokenEvent);
  // console.log("PriceEvent:", tokenEvent);
}

// // if the zkapp is not deployed yet, create an update transaction
// if (isDeployed)
// {
//     let x = zkapp.oraclePublicKey.get();
//     console.log(`Found deployed zkapp, updating state ${x} -> ${x.add(10)}.`);
//     let transaction = await Mina.transaction(
//         { feePayerKey, fee: transactionFee },
//         () => {
//             zkapp.update(Field(10));
//         }
//     );
//     // fill in the proof - this can take a while...
//     console.log('Creating an execution proof...');
//     await transaction.prove();

//     // if you want to inspect the transaction, you can print it out:
//     // console.log(transaction.toGraphqlQuery());

//     // send the transaction to the graphql endpoint
//     console.log('Sending the transaction...');
//     await transaction.send();
// }

shutdown();
