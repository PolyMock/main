declare module 'bn.js' {
	export default class BN {
		constructor(value: number | string | number[] | Buffer | BN, base?: number | 'hex');
		toString(base?: number | 'hex'): string;
		toNumber(): number;
		toArray(endian?: 'le' | 'be', length?: number): number[];
		toBuffer(endian?: 'le' | 'be', length?: number): Buffer;
		add(b: BN): BN;
		sub(b: BN): BN;
		mul(b: BN): BN;
		div(b: BN): BN;
		mod(b: BN): BN;
		pow(b: BN): BN;
		and(b: BN): BN;
		or(b: BN): BN;
		xor(b: BN): BN;
		shln(b: number): BN;
		shrn(b: number): BN;
		eq(b: BN): boolean;
		lt(b: BN): boolean;
		lte(b: BN): boolean;
		gt(b: BN): boolean;
		gte(b: BN): boolean;
		isZero(): boolean;
		isNeg(): boolean;
		neg(): BN;
		abs(): BN;
		toTwos(width: number): BN;
		fromTwos(width: number): BN;
	}
}
