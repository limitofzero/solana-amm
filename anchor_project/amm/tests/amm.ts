import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import {airdrop, checkAmm, indexToSeed, createAmm} from "./helper";

describe("amm", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let connection = anchor.getProvider().connection;

  const program = anchor.workspace.amm as Program<Amm>;

  let signer = Keypair.generate();
  let admin1 = Keypair.generate();

  beforeEach(async () => {
    await airdrop(connection, signer.publicKey)
  })

  describe("create_amm", async () => {
    const index1 = 1;
    const fee = 100;

    it("Is created!", async () => {
      const { ammPda } = await createAmm(program, signer, admin1.publicKey, fee, index1);
      await checkAmm(program, ammPda, admin1.publicKey, index1, fee);
    });

    it("Can create 2 pools with different indices", async () => {
      const index1 = 10;
      const index2 = 11;
      const fee = 100;

      const { ammPda: ammPda1 } = await createAmm(program, signer, admin1.publicKey, fee, index1);
      await checkAmm(program, ammPda1, admin1.publicKey, index1, fee);

      const { ammPda: ammPda2 } = await createAmm(program, signer, admin1.publicKey, fee, index2);
      await checkAmm(program, ammPda2, admin1.publicKey, index2, fee);
    });

    it("Cannot create 2 pools with the same index", async () => {
      const index1 = 20;
      const fee = 100;

      const { ammPda } = await createAmm(program, signer, admin1.publicKey, fee, index1);
      await checkAmm(program, ammPda, admin1.publicKey, index1, fee);

      try {
        await createAmm(program, signer, admin1.publicKey, fee, index1);
        assert.fail("Expected transaction to fail");
      } catch (err) {
        assert.isTrue(err.toString().includes("already in use") || err.toString().includes("AccountDiscriminatorAlreadySet"), "Expected account already in use error");
      }
    });
  })
});
