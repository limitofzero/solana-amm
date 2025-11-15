import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import {airdrop, checkAmm, indexToSeed} from "./helper";

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
      const [ammPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("AMM"), indexToSeed(index1)],
          program.programId
      );


      await program.methods.createAmm(fee, index1).accounts({
        amm: ammPda,
        adminAccount: admin1.publicKey,
        signer: signer.publicKey,
        systemProgram: SystemProgram.programId,
      }).signers([signer]).rpc({ commitment: "confirmed" });

      await checkAmm(program, ammPda, admin1.publicKey, index1, fee);
    });

    it("Can create 2 pools with different indices", async () => {
      const index1 = 10;
      const index2 = 11;
      const fee = 100;

      const [ammPda1] = PublicKey.findProgramAddressSync(
          [Buffer.from("AMM"), indexToSeed(index1)],
          program.programId
      );

      await program.methods.createAmm(fee, index1).accounts({
        amm: ammPda1,
        adminAccount: admin1.publicKey,
        signer: signer.publicKey,
        systemProgram: SystemProgram.programId,
      }).signers([signer]).rpc({ commitment: "confirmed" });

      await checkAmm(program, ammPda1, admin1.publicKey, index1, fee);

      const [ammPda2] = PublicKey.findProgramAddressSync(
          [Buffer.from("AMM"), indexToSeed(index2)],
          program.programId
      );

      await program.methods.createAmm(fee, index2).accounts({
        amm: ammPda2,
        adminAccount: admin1.publicKey,
        signer: signer.publicKey,
        systemProgram: SystemProgram.programId,
      }).signers([signer]).rpc({ commitment: "confirmed" });

      await checkAmm(program, ammPda2, admin1.publicKey, index2, fee);
    });

    it("Cannot create 2 pools with the same index", async () => {
      const index1 = 20;
      const fee = 100;

      const [ammPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("AMM"), indexToSeed(index1)],
          program.programId
      );

      await program.methods.createAmm(fee, index1).accounts({
        amm: ammPda,
        adminAccount: admin1.publicKey,
        signer: signer.publicKey,
        systemProgram: SystemProgram.programId,
      }).signers([signer]).rpc({ commitment: "confirmed" });

      await checkAmm(program, ammPda, admin1.publicKey, index1, fee);

      try {
        await program.methods.createAmm(fee, index1).accounts({
          amm: ammPda,
          adminAccount: admin1.publicKey,
          signer: signer.publicKey,
          systemProgram: SystemProgram.programId,
        }).signers([signer]).rpc({ commitment: "confirmed" });
        
        assert.fail("Expected transaction to fail");
      } catch (err) {
        assert.isTrue(err.toString().includes("already in use") || err.toString().includes("AccountDiscriminatorAlreadySet"), "Expected account already in use error");
      }
    });
  })
});
