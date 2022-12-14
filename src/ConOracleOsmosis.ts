// Created by rhvall
// GNU GENERAL PUBLIC LICENSE
// Version 3, 29 June 2007

// Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
// Everyone is permitted to copy and distribute verbatim copies
// of this license document, but changing it is not allowed.

import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Permissions,
  CircuitString,
  PublicKey,
  Signature,
  PrivateKey,
} from 'snarkyjs';

// import { load } from 'ts-dotenv';
//
// const env = load({
//     ENDPOINT: String,
//     ORACLE_PUBLIC_KEY: String
// });

export class ConOracleOsmosis extends SmartContract {
  // Define contract state
  @state(PublicKey) oraclePublicKey = State<PublicKey>();

  // Define contract events
  events = {
    hash: Field,
  };

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  @method init(zkappKey: PrivateKey) {
    super.init();

    // Initialize contract state
    // this.oraclePublicKey.set(PublicKey.fromBase58(env.ORACLE_PUBLIC_KEY));
    this.oraclePublicKey.set(zkappKey.toPublicKey());

    // Specify that caller should include signature with tx instead of proof
    this.requireSignature();
  }

  @method verifyPrice(
    price: Field,
    token: CircuitString,
    dataHash: Field,
    signature: Signature
  ) {
    // Get the oracle public key from the contract state
    const oraclePublicKey = this.oraclePublicKey.get();
    this.oraclePublicKey.assertEquals(oraclePublicKey);

    // Evaluate whether the signature is valid for the provided data
    const validSignature = signature.verify(oraclePublicKey, [dataHash]);

    // Check that the signature is valid
    validSignature.assertTrue();

    // Emit an event containing the verified price and token
    this.emitEvent('hash', dataHash);
  }
}
