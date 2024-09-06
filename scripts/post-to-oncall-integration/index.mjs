/**
 * node --env-file=.env index.mjs
 */

try {
	const res = await fetch(process.env.WEBHOOK_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			alert_uid: "08d6891a-835c-e661-39fa-96b6a9e26552",
			title: "webhookのテスト",
			image_url:
				"https://upload.wikimedia.org/wikipedia/commons/e/ee/Grumpy_Cat_by_Gage_Skidmore.jpg",
			state: "alerting",
			link_to_upstream_details: "https://en.wikipedia.org/wiki/Downtime",
			message: "webhookのテスト用メッセージ",
		}),
	});
	const json = await res.json();
	console.log(json);
} catch (error) {
	console.error(error);
}

try {
	const res = await fetch(process.env.WEBHOOK_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			alert_uid: "08d6891a-835c-e661-39fa-96b6a9e26552",
			title: "webhookのテスト",
			image_url:
				"https://upload.wikimedia.org/wikipedia/commons/e/ee/Grumpy_Cat_by_Gage_Skidmore.jpg",
			state: "OK",
			link_to_upstream_details: "https://en.wikipedia.org/wiki/Downtime",
			message: "webhookのテスト用メッセージ",
		}),
	});
	const json = await res.json();
	console.log(json);
} catch (error) {
	console.error(error);
}
