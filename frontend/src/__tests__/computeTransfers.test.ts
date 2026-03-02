import { describe, it, expect } from "vitest";
import { computeTransfers, type Transfer } from "../lib/computeTransfers";

type Player = {
    user_id: string;
    profit: number;
};

function makePlayer(id: string, profit: number): Player {
    return { user_id: id, profit };
}

describe("computeTransfers", () => {
    it("handles simple 2-player case", () => {
        const players = [makePlayer("A", 50), makePlayer("B", -50)];
        const transfers = computeTransfers(players);

        expect(transfers).toHaveLength(1);
        expect(transfers[0]).toEqual({
            from_user_id: "B",
            to_user_id: "A",
            amount: 50,
        });
    });

    it("handles 3 players: 1 winner, 2 losers", () => {
        const players = [
            makePlayer("A", 30),
            makePlayer("B", -10),
            makePlayer("C", -20),
        ];
        const transfers = computeTransfers(players);

        const totalPaid = transfers.reduce((sum: number, t: Transfer) => sum + t.amount, 0);
        expect(totalPaid).toBe(30);
        expect(transfers.every((t: Transfer) => t.to_user_id === "A")).toBe(true);
    });

    it("handles 3 players: 2 winners, 1 loser", () => {
        const players = [
            makePlayer("A", 20),
            makePlayer("B", 10),
            makePlayer("C", -30),
        ];
        const transfers = computeTransfers(players);

        const totalPaid = transfers.reduce((sum: number, t: Transfer) => sum + t.amount, 0);
        expect(totalPaid).toBe(30);
        expect(transfers.every((t: Transfer) => t.from_user_id === "C")).toBe(true);
    });

    it("handles all players breaking even", () => {
        const players = [
            makePlayer("A", 0),
            makePlayer("B", 0),
            makePlayer("C", 0),
        ];
        const transfers = computeTransfers(players);
        expect(transfers).toHaveLength(0);
    });

    it("handles 4 players with complex profits", () => {
        const players = [
            makePlayer("A", 40),
            makePlayer("B", 10),
            makePlayer("C", -30),
            makePlayer("D", -20),
        ];
        const transfers = computeTransfers(players);

        // Verify net zero for each player
        const netMap: Record<string, number> = {};
        for (const t of transfers) {
            netMap[t.from_user_id] = (netMap[t.from_user_id] || 0) - t.amount;
            netMap[t.to_user_id] = (netMap[t.to_user_id] || 0) + t.amount;
        }
        expect(netMap["A"]).toBeCloseTo(40);
        expect(netMap["B"]).toBeCloseTo(10);
        expect(netMap["C"]).toBeCloseTo(-30);
        expect(netMap["D"]).toBeCloseTo(-20);

        // Greedy should minimize transfers (should be <= 3)
        expect(transfers.length).toBeLessThanOrEqual(3);
    });

    it("handles floating point amounts correctly", () => {
        const players = [
            makePlayer("A", 33.33),
            makePlayer("B", -16.67),
            makePlayer("C", -16.66),
        ];
        const transfers = computeTransfers(players);

        const totalPaid = transfers.reduce((sum: number, t: Transfer) => sum + t.amount, 0);
        expect(totalPaid).toBeCloseTo(33.33, 1);
    });

    it("handles a single player (no transfers needed)", () => {
        const players = [makePlayer("A", 0)];
        const transfers = computeTransfers(players);
        expect(transfers).toHaveLength(0);
    });

    it("minimizes transfers with many players", () => {
        const players = [
            makePlayer("A", 60),
            makePlayer("B", 40),
            makePlayer("C", -25),
            makePlayer("D", -25),
            makePlayer("E", -25),
            makePlayer("F", -25),
        ];
        const transfers = computeTransfers(players);

        const netMap: Record<string, number> = {};
        for (const t of transfers) {
            netMap[t.from_user_id] = (netMap[t.from_user_id] || 0) - t.amount;
            netMap[t.to_user_id] = (netMap[t.to_user_id] || 0) + t.amount;
        }
        expect(netMap["A"]).toBeCloseTo(60);
        expect(netMap["B"]).toBeCloseTo(40);
        expect(transfers.length).toBeLessThanOrEqual(5);
    });

    it("handles exact match pairs", () => {
        const players = [
            makePlayer("A", 50),
            makePlayer("B", 30),
            makePlayer("C", -50),
            makePlayer("D", -30),
        ];
        const transfers = computeTransfers(players);

        const netMap: Record<string, number> = {};
        for (const t of transfers) {
            netMap[t.from_user_id] = (netMap[t.from_user_id] || 0) - t.amount;
            netMap[t.to_user_id] = (netMap[t.to_user_id] || 0) + t.amount;
        }
        expect(netMap["A"]).toBeCloseTo(50);
        expect(netMap["B"]).toBeCloseTo(30);
        expect(netMap["C"]).toBeCloseTo(-50);
        expect(netMap["D"]).toBeCloseTo(-30);
    });
});
