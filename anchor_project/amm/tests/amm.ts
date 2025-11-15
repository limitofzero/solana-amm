import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("amm", () => {
  // Configure the client to use the local cluster.
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
      const indexSeed = Buffer.alloc(2)
      indexSeed.writeInt16LE(index1)
      const [ammPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("AMM"), indexSeed],
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
  })

  async function airdrop(connection: Connection, address: PublicKey, amount = 1_000_000_000) {
    await connection.confirmTransaction(await connection.requestAirdrop(address, amount), "confirmed");
  }

  function indexToSeed(index: number) {
    const indexSeed = Buffer.alloc(2)
    indexSeed.writeInt16LE(index)
    return indexSeed;
  }

  async function checkAmm(
      program: anchor.Program<Amm>,
      amm: PublicKey,
      admin: PublicKey,
      index: number,
      fee: number,
  ) {
    let ammData = await program.account.amm.fetch(amm);

    assert.strictEqual(ammData.admin.toBase58(), admin.toBase58(), `Tweet topic should be "${admin}" but was "${ammData.admin}"`);
    assert.strictEqual(ammData.index, index, `Tweet topic should be "${index}" but was "${ammData.index}"`);
    assert.strictEqual(ammData.fee, fee, `Tweet topic should be "${fee}" but was "${ammData.fee}"`);
  }
});
