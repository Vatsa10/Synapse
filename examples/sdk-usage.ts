/**
 * Multi-Channel SDK Usage Examples (Phase 3)
 */

import {
	createChannelAdapter,
	WebChannelAdapter,
	WhatsAppChannelAdapter,
	XChannelAdapter,
	EmailChannelAdapter,
	PhoneChannelAdapter,
} from "../lib/sdk";

// Example 1: Web Channel
async function webExample() {
	const webAdapter = new WebChannelAdapter("http://localhost:3000");

	const webMessage = {
		session_cookie: "a83d-session-cookie-123",
		message: "My order AB123 is delayed. When will it arrive?",
		metadata: {
			ip: "192.168.1.1",
			geo: "US",
			lang: "en",
			user_agent: "Mozilla/5.0...",
		},
	};

	const response = await webAdapter.sendMessage(webMessage);
	console.log("Web response:", response);

	// Retrieve memory
	const memory = await webAdapter.retrieveMemory(response.session_id!, "Order status");
	console.log("Memory:", memory);
}

// Example 2: WhatsApp Channel
async function whatsappExample() {
	const whatsappAdapter = new WhatsAppChannelAdapter("http://localhost:3000");

	const whatsappMessage = {
		from: "+1234567890",
		message: "I need help with my refund request",
		metadata: {
			geo: "US",
			lang: "en",
		},
	};

	const response = await whatsappAdapter.sendMessage(whatsappMessage);
	console.log("WhatsApp response:", response);
}

// Example 3: X/Twitter Channel
async function xExample() {
	const xAdapter = new XChannelAdapter("http://localhost:3000");

	const xMessage = {
		handle: "@username",
		tweet_id: "1234567890",
		message: "Your service is terrible! I want a refund immediately!",
		metadata: {
			geo: "US",
			lang: "en",
		},
	};

	const response = await xAdapter.sendMessage(xMessage);
	console.log("X response:", response);
}

// Example 4: Email Channel
async function emailExample() {
	const emailAdapter = new EmailChannelAdapter("http://localhost:3000");

	const emailMessage = {
		from: "customer@example.com",
		subject: "Order AB123 Issue",
		message: "My order has not arrived. This is unacceptable.",
		metadata: {
			ip: "192.168.1.1",
			geo: "US",
			lang: "en",
		},
	};

	const response = await emailAdapter.sendMessage(emailMessage);
	console.log("Email response:", response);
}

// Example 5: Phone Channel
async function phoneExample() {
	const phoneAdapter = new PhoneChannelAdapter("http://localhost:3000");

	const phoneMessage = {
		phone_number: "+1234567890",
		transcript: "Hello, I'm calling about my order that hasn't arrived. This is urgent.",
		metadata: {
			geo: "US",
			lang: "en",
		},
	};

	const response = await phoneAdapter.sendMessage(phoneMessage);
	console.log("Phone response:", response);
}

// Example 6: Using createChannelAdapter factory
async function factoryExample() {
	const adapter = createChannelAdapter("web", "http://localhost:3000");

	const message = {
		session_cookie: "session-123",
		message: "I have a problem with my order",
	};

	const response = await adapter.sendMessage(message);
	console.log("Factory response:", response);
}

// Run examples
if (require.main === module) {
	Promise.all([webExample(), whatsappExample(), xExample(), emailExample(), phoneExample(), factoryExample()]).catch(
		console.error
	);
}

