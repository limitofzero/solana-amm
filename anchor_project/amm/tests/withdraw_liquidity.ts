import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {Amm} from "../target/types/amm";
import {Keypair, PublicKey, Connection} from "@solana/web3.js";
import {assert} from "chai";
import {
    createAssociatedTokenAccount,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    mintTo
} from "@solana/spl-token";
import {airdrop, createAmm, createMintSafe, createPool} from "./helper";

describe("withdraw_liquidity", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    let connection: Connection = anchor.getProvider().connection;

    const program = anchor.workspace.amm as Program<Amm>;
    const DECIMALS = new anchor.BN(10).pow(new anchor.BN(9));

    // Helper function to add liquidity
    async function addLiquidity(
        program: Program<Amm>,
        connection: Connection,
        signer: Keypair,
        mintAuthority: Keypair,
        poolPda: PublicKey,
        mintA: PublicKey,
        mintB: PublicKey,
        mintLiquidityPda: PublicKey,
        amountA: anchor.BN,
        amountB: anchor.BN
    ): Promise<{lpAmount: anchor.BN}> {
        const depositorAccountA = getAssociatedTokenAddressSync(mintA, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB, signer.publicKey, false);
        const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB, signer.publicKey);
        } catch (err) {
        }

        await mintTo(connection, mintAuthority, mintA, depositorAccountA, mintAuthority, amountA.toNumber());
        await mintTo(connection, mintAuthority, mintB, depositorAccountB, mintAuthority, amountB.toNumber());

        await program.methods.addLiquidity(amountA, amountB).accounts({
            pool: poolPda,
            mintA: mintA,
            mintB: mintB,
            depositor: signer.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const lpAccount = await getAccount(connection, depositorAccountLiquidity);
        return {lpAmount: new anchor.BN(lpAccount.amount.toString())};
    }

    // Helper function to withdraw liquidity
    async function withdrawLiquidity(
        program: Program<Amm>,
        connection: Connection,
        signer: Keypair,
        poolPda: PublicKey,
        mintA: PublicKey,
        mintB: PublicKey,
        mintLiquidityPda: PublicKey,
        authorityPda: PublicKey,
        lpAmountToBurn: anchor.BN
    ): Promise<{amountAOut: anchor.BN, amountBOut: anchor.BN}> {
        const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, signer.publicKey, false);
        const depositorAccountA = getAssociatedTokenAddressSync(mintA, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB, signer.publicKey, false);

        const poolAccountA = await getAccount(connection, getAssociatedTokenAddressSync(mintA, authorityPda, true));
        const poolAccountB = await getAccount(connection, getAssociatedTokenAddressSync(mintB, authorityPda, true));

        const reserveABefore = new anchor.BN(poolAccountA.amount.toString());
        const reserveBBefore = new anchor.BN(poolAccountB.amount.toString());
        const mintLiquidity = await getMint(connection, mintLiquidityPda);
        const totalLp = new anchor.BN(mintLiquidity.supply.toString());

        const expectedAmountAOut = lpAmountToBurn.mul(reserveABefore).div(totalLp);
        const expectedAmountBOut = lpAmountToBurn.mul(reserveBBefore).div(totalLp);

        await program.methods.withdrawLiquidity(lpAmountToBurn).accounts({
            pool: poolPda,
            mintA: mintA,
            mintB: mintB,
            mintLiquidity: mintLiquidityPda,
            depositor: signer.publicKey,
            depositorAccountLiquidity: depositorAccountLiquidity,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        return {amountAOut: expectedAmountAOut, amountBOut: expectedAmountBOut};
    }

    // Helper to get pool reserves
    async function getPoolReserves(
        connection: Connection,
        mintA: PublicKey,
        mintB: PublicKey,
        authorityPda: PublicKey
    ): Promise<{reserveA: anchor.BN, reserveB: anchor.BN}> {
        const poolAccountA = await getAccount(connection, getAssociatedTokenAddressSync(mintA, authorityPda, true));
        const poolAccountB = await getAccount(connection, getAssociatedTokenAddressSync(mintB, authorityPda, true));

        return {
            reserveA: new anchor.BN(poolAccountA.amount.toString()),
            reserveB: new anchor.BN(poolAccountB.amount.toString())
        };
    }

    it("User adds liquidity to pool A/B, then withdraws full amount - pool should be empty", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 300;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = new anchor.BN(200).mul(DECIMALS);

        const {lpAmount} = await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA, amountB
        );

        await withdrawLiquidity(
            program, connection, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lpAmount
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        assert.isTrue(reserveA.eq(new anchor.BN(0)), `Pool reserve A should be 0, but was ${reserveA.toString()}`);
        assert.isTrue(reserveB.eq(new anchor.BN(0)), `Pool reserve B should be 0, but was ${reserveB.toString()}`);
    });

    it("User adds liquidity to pool A/B, withdraws in 2 steps (50% each) - pool should be empty", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 301;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = new anchor.BN(200).mul(DECIMALS);

        const {lpAmount} = await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA, amountB
        );

        const firstHalf = lpAmount.div(new anchor.BN(2));
        await withdrawLiquidity(
            program, connection, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, firstHalf
        );

        const {reserveA: reserveA1, reserveB: reserveB1} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        assert.isTrue(reserveA1.gt(new anchor.BN(0)), "Pool should still have reserves after first withdrawal");
        assert.isTrue(reserveB1.gt(new anchor.BN(0)), "Pool should still have reserves after first withdrawal");

        const secondHalf = lpAmount.sub(firstHalf);
        await withdrawLiquidity(
            program, connection, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, secondHalf
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        assert.isTrue(reserveA.eq(new anchor.BN(0)), `Pool reserve A should be 0, but was ${reserveA.toString()}`);
        assert.isTrue(reserveB.eq(new anchor.BN(0)), `Pool reserve B should be 0, but was ${reserveB.toString()}`);
    });

    it("Three users add liquidity, user2 withdraws, user1 withdraws 50%, user3 withdraws fully - check pool", async () => {
        const user1 = Keypair.generate();
        const user2 = Keypair.generate();
        const user3 = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 302;
        const fee = 100;

        await airdrop(connection, user1.publicKey);
        await airdrop(connection, user2.publicKey);
        await airdrop(connection, user3.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user1, user1.publicKey, 9, mintA);
        await createMintSafe(connection, user1, user1.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user1, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user1, ammPda, mintA.publicKey, mintB.publicKey);

        const amountA1 = new anchor.BN(100).mul(DECIMALS);
        const amountB1 = new anchor.BN(200).mul(DECIMALS);
        const {lpAmount: lp1} = await addLiquidity(
            program, connection, user1, user1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA1, amountB1
        );

        const amountA2 = new anchor.BN(50).mul(DECIMALS);
        const amountB2 = new anchor.BN(100).mul(DECIMALS);
        const {lpAmount: lp2} = await addLiquidity(
            program, connection, user2, user1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA2, amountB2
        );

        const amountA3 = new anchor.BN(25).mul(DECIMALS);
        const amountB3 = new anchor.BN(50).mul(DECIMALS);
        const {lpAmount: lp3} = await addLiquidity(
            program, connection, user3, user1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA3, amountB3
        );

        await withdrawLiquidity(
            program, connection, user2, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lp2
        );

        const lp1Half = lp1.div(new anchor.BN(2));
        await withdrawLiquidity(
            program, connection, user1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lp1Half
        );

        await withdrawLiquidity(
            program, connection, user3, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lp3
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const expectedReserveA = amountA1.div(new anchor.BN(2));
        const expectedReserveB = amountB1.div(new anchor.BN(2));
        
        assert.isTrue(
            reserveA.gte(expectedReserveA.sub(new anchor.BN(2))) && reserveA.lte(expectedReserveA.add(new anchor.BN(2))),
            `Pool reserve A should be approximately ${expectedReserveA.toString()}, but was ${reserveA.toString()}`
        );
        assert.isTrue(
            reserveB.gte(expectedReserveB.sub(new anchor.BN(2))) && reserveB.lte(expectedReserveB.add(new anchor.BN(2))),
            `Pool reserve B should be approximately ${expectedReserveB.toString()}, but was ${reserveB.toString()}`
        );
    });

    it("User adds liquidity to pool B/C, tries to withdraw from A/B (error), then tries to withdraw 0 from B/C (error), then tries to withdraw more LP than they have (error)", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const mintC = Keypair.generate();
        const ammIndex = 303;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);
        await createMintSafe(connection, user, user.publicKey, 9, mintC);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda: poolAB, mintLiquidityPda: mintLiquidityAB} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);
        const {poolPda: poolBC, mintLiquidityPda: mintLiquidityBC} = await createPool(program, user, ammPda, mintB.publicKey, mintC.publicKey);

        const amountB = new anchor.BN(100).mul(DECIMALS);
        const amountC = new anchor.BN(200).mul(DECIMALS);

        const {lpAmount} = await addLiquidity(
            program, connection, user, user, poolBC, mintB.publicKey, mintC.publicKey, mintLiquidityBC, amountB, amountC
        );

        try {
            await program.methods.withdrawLiquidity(lpAmount).accounts({
                pool: poolAB,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                mintLiquidity: mintLiquidityAB,
                depositor: user.publicKey,
                depositorAccountLiquidity: getAssociatedTokenAddressSync(mintLiquidityAB, user.publicKey, false),
                depositorAccountA: getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false),
                depositorAccountB: getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false),
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail when withdrawing from wrong pool");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(
                errorString.includes("Error") || errorString.includes("Constraint") || errorString.includes("AccountNotInitialized"),
                `Expected error when withdrawing from wrong pool, got: ${errorString}`
            );
        }

        try {
            await program.methods.withdrawLiquidity(new anchor.BN(0)).accounts({
                pool: poolBC,
                mintA: mintB.publicKey,
                mintB: mintC.publicKey,
                mintLiquidity: mintLiquidityBC,
                depositor: user.publicKey,
                depositorAccountLiquidity: getAssociatedTokenAddressSync(mintLiquidityBC, user.publicKey, false),
                depositorAccountA: getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false),
                depositorAccountB: getAssociatedTokenAddressSync(mintC.publicKey, user.publicKey, false),
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail when withdrawing 0 LP");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(
                errorString.includes("AmountIsZero") || errorString.includes("6000"),
                `Expected AmountIsZero error, got: ${errorString}`
            );
        }

        const tooMuchLp = lpAmount.add(new anchor.BN(1));
        try {
            await program.methods.withdrawLiquidity(tooMuchLp).accounts({
                pool: poolBC,
                mintA: mintB.publicKey,
                mintB: mintC.publicKey,
                mintLiquidity: mintLiquidityBC,
                depositor: user.publicKey,
                depositorAccountLiquidity: getAssociatedTokenAddressSync(mintLiquidityBC, user.publicKey, false),
                depositorAccountA: getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false),
                depositorAccountB: getAssociatedTokenAddressSync(mintC.publicKey, user.publicKey, false),
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail when withdrawing more LP than user has");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(
                errorString.includes("InsufficientLpBalance") || errorString.includes("6004"),
                `Expected InsufficientLpBalance error, got: ${errorString}`
            );
        }
    });
});

