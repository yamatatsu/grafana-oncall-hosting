/**
 * This script is used to insert fake data into the database for local environments.
 */
import { setTimeout } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

process.on("SIGINT", () => {
	console.info("Closing prisma connection...");

	prisma
		.$disconnect()
		.then(() => {
			console.info("prisma connection closed.");
		})
		.catch((e) => {
			console.error(e);
		})
		.finally(() => {
			process.exit();
		});
});

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error(e);
		await prisma.$disconnect();
		process.exit(1);
	});

// main()

async function main() {
	while (true) {
		const now = new Date();
		console.info(`Inserting data at ${now.toISOString()}`);

		const device1 = sineWave(now, {
			periodicTimeMs: minToMs(10),
			amplitude: 10,
		});
		const device2 = sineWave(now, {
			periodicTimeMs: minToMs(10),
			amplitude: 10,
			phaseShiftMs: minToMs(2),
		});

		await Promise.all([
			setTimeout(5_000),
			prisma.iotData.createMany({
				data: [
					{
						time: now,
						gatewayName: "gateway1",
						devices: {
							device1,
							device1Error: device1 < 0,
							device2,
							device2Error: device2 < 0,
						},
					},
				],
			}),
		]);
	}
}

// lib

/**
 * return a number as a sine wave
 * @param datetime
 * @param props.periodicTimeMs the time of a period in milliseconds
 * @param props.amplitude the amplitude of the sine wave
 * @param props.offset the offset of the sine wave
 * @param props.phaseShiftMs the phase shift of the sine wave
 * @returns a number between `offset - amplitude` and `offset + amplitude`
 */
function sineWave(
	datetime: Date,
	props: {
		periodicTimeMs: number;
		amplitude: number;
		offset?: number;
		phaseShiftMs?: number;
	},
): number {
	const { periodicTimeMs, amplitude, offset = 0, phaseShiftMs = 0 } = props;

	const shiftedMs = datetime.getTime() - phaseShiftMs;

	// 0 <= rate < 1
	const rate = (shiftedMs % periodicTimeMs) / periodicTimeMs;

	const sine = Math.sin(2 * Math.PI * rate);
	return offset + amplitude * sine;
}

function minToMs(min: number): number {
	return min * 60 * 1000;
}
