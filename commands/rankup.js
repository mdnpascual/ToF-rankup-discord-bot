const { SlashCommandBuilder } = require('discord.js');
const https = require('https');
const fs = require('fs');
const cv = require("opencv4nodejs");

var detector = new cv.ORBDetector();
const {performance} = require('perf_hooks');
const validChannelIDs = ["1015306794538639441", "970398085056446504"];
const validFileType = ["jpg", "png"]
const privateMessages = false;
var sizeFilter = 0.4;

const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rankup')
		.setDescription('Include your screenshot to Rank up')
		.addAttachmentOption(option =>
			option.setName("screenshot")
			.setDescription("Screenshot that includes CS Number")
			.setRequired(false)),

	async execute(interaction) {
		const userTag = interaction.user.tag;
		const guild = interaction.guild.id;
		const channelId = interaction.channel.id;
		const attachments = interaction.options.getAttachment('screenshot');
		await interaction.deferReply({ ephemeral: privateMessages });

		try{
			// Check for attachment
			if (attachments === null){
				await interaction.editReply({
					content: "A screenshot attachment is required",
					ephemeral: privateMessages});
				return;
			}
		} catch (error) {
			console.error(error);
		}

		if (validChannelIDs.includes(channelId)){

			var DbClient = new MongoClient(mongoDBURI);
			var userData = await getUser(DbClient, userTag, guild);
			var rankingCutoff = await getRankingCutoffs(DbClient, guild);
			var sortedRankingCutoff = rankingCutoff.sort((a,b) => parseInt(b.min_cs) - parseInt(a.min_cs));

			if (userData !== null){
				var rateLimitInSeconds = await getRateLimitInSeconds(DbClient, guild);
				var dateData = new Date(userData.lastUpdate)
				var secondDifference = parseInt((new Date() - dateData) / 1000);

				// Rate Limit Check
				if (secondDifference < rateLimitInSeconds){
					try{
						await interaction.editReply({
							content: "You just recently updated your Score. You can send your next update in " + secondsToMinSec(rateLimitInSeconds - secondDifference) ,
							ephemeral: privateMessages});
					} catch (error) {
						console.error(error);
					}
					return;
				}
			}

			var result = await download(attachments.url, userTag);
			if (result.split("fds7890sadf7890").length > 1){
				try{
					await interaction.editReply({
						content: result.split("fds7890sadf7890")[1],
						ephemeral: privateMessages});
				} catch (error) {
					console.error(error);
				}
			} else {
				var filePath = result;
				await mainDetect(filePath, interaction, DbClient, userData, userTag, guild, sortedRankingCutoff);
			}
		} else {
			try{
				await interaction.editReply({
					content: "Bot must be used only in " + interaction.guild.channels.cache.find(channel => channel.id === "970398085056446504").toString(),
					ephemeral: privateMessages});
			} catch (error) {
				console.error(error);
			}
		}
	},
};

async function getRateLimitInSeconds(DbClient, guild_id){
	try{
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('settings');

		const query = { guild_id: guild_id }
		const settingRecord = await records.findOne(query);

		return parseInt(settingRecord.rateLimitInSeconds);
	} catch (error) {
		console.error(error);
	} finally { }
}

async function getUser(DbClient, tag, guild_id)
{
	try{
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('records');

		const query = { discord_tag: tag, guild_id: guild_id }
		const userRecord = await records.findOne(query);

		return userRecord;
	} catch (error) {
		console.error(error);
	} finally { }
}

async function getRankingCutoffs(DbClient, guild_id){
	try{
		console.log("fetching ranks");
		const database = DbClient.db('ToF-RankUp-DB');
		const ranks = database.collection('ranks');

		const query = { guild_id: guild_id }
		return await ranks.find(query).toArray();
	} catch (error) {
		console.error(error);
	} finally { }
}

async function updateUser(DbClient, score, discord_tag, guild_id, setBy){
	try{
		console.log("Updating Gear score of " + discord_tag + " with score: " + score);
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('records');

		const filter = { discord_tag: discord_tag,  guild_id: guild_id };
		const options = { upsert: true };

		const doc = {
			$set: {
				CS: score,
				discord_tag: discord_tag,
				guild_id: guild_id,
				lastUpdate: new Date(),
				setBy: setBy ?? "BOT"
			},
		}

		const result = await records.updateOne(filter, doc, options);
	} catch (error) {
		console.error(error);
	} finally { }
}

async function insertUser(DbClient, score, discord_tag, guild_id, setBy){
	try{
		console.log("Inserting Gear score of " + discord_tag + " with score: " + score);
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('records');

		const doc = {
			CS: score,
			discord_tag: discord_tag,
			guild_id: guild_id,
			lastUpdate: new Date(),
			setBy: setBy ?? "BOT"
		}

		const result = await records.insertOne(doc);
	} catch (error) {
		console.error(error);
	} finally { }
}

async function mainDetect(url, interaction, DbClient, userData, user, guild, rankingCutoff){
	var matchedDigits = []
	fs.readFile(url, async (err, data) => {
		var incoming = cv.imdecode(data);

		var scaleIndex = getIndex(incoming.cols, incoming.rows);
		file = "./templates/template" + (scaleIndex + 1) + ".jpg";
		var template = cv.imread(file);

		var result = incoming.matchTemplate(template, 5);

		const minMax = result.minMaxLoc();
		const { maxLoc: { x, y }, maxVal: yResult } = minMax;

		// Check if GS Icon is found
		if (yResult < 0.55){
			try{
				await interaction.editReply({
					content: "Unable to read CS Score",
					ephemeral: privateMessages
				});
			} catch (error) {
				console.error(error);
			}
			return;
		}

		// Crop CS Score for OCR Processing
		var cropped = incoming.getRegion(new cv.Rect(
			Math.ceil(incoming.cols * 0.82),
			y + Math.ceil(incoming.rows * 0.008),
			Math.ceil(incoming.cols * 0.12),
			Math.ceil(template.rows * 0.6)
			)
		)

		console.log(`Resolution chosen: ` + resolutions[scaleIndex].w + "x" + resolutions[scaleIndex].h + ", scale: " + resolutions[scaleIndex].scale);

		// Read OCR Digits, 0-9
		for(i = 0; i < 10; i++){
			matchedDigits.push(...templateMatching(cropped, scaleIndex, i, interaction))
		}

		// Sort and Display OCR'd CS Score
		matchedDigits.sort((a,b) => {return a.xLoc - b.xLoc})

		// PRUNE
		try{
			for(i = 0; i < matchedDigits.length; i++){
				var nearby = matchedDigits.filter(entry => entry.xLoc >= matchedDigits[i].xLoc && entry.xLoc <= matchedDigits[i].xLoc + (matchedDigits[i].matsize * sizeFilter));
				var sortedNearby = nearby.sort((a,b) => {return parseFloat(b.certainty) - parseFloat(a.certainty)})
				if(sortedNearby.length > 1){
					for(ii = 1; ii < sortedNearby.length; ii++){
						matchedDigits = matchedDigits.filter(entry => entry !== sortedNearby[ii])
					}
					i -= sortedNearby.length - 1;
				}
			}
		} catch (exception){
			console.log(exception)
		}

		var score = matchedDigits.map((elem) => elem.digit).join("");

		outputBuffer = cv.imencode(".jpg", incoming);

		// DB Calls
		if (userData === null){
			await insertUser(DbClient, score, user, guild, null);
		} else {
			await updateUser(DbClient, score, user, guild, null);
		}

		await DbClient.close();

		var additionalMessage = await updateRoles(score, rankingCutoff, interaction);

		try{
			await interaction.editReply({
				content: "CS Score: " + score +".\n" + additionalMessage,
				files: [
					{ attachment: outputBuffer }
				],
				ephemeral: privateMessages
			});
		} catch (error) {
			console.error(error);
		}

		// cv.imshow('match', incoming);
		// cv.waitKey();
	});

	async function updateRoles(score, rankingCutoff, interaction) {
		var additionalMessage = "";
		var noRoleChange = false;

		var rankList = rankingCutoff.map((rank) => rank.min_cs);
		var rankListindexFound = rankList.findIndex(rankScore => score >= rankScore);
		var roleIdToGive = rankingCutoff[rankListindexFound].roleId;
		var roleIdList = rankingCutoff.map((rank) => rank.roleId);

		var userRoles = interaction.member.roles.cache;
		var rankIdToRemove = null;
		var rankNameToRemove = null;
		userRoles.forEach((value, key) => {
			if (roleIdToGive === key) {
				additionalMessage += "\nNo updates in Rank.";
				noRoleChange = true;
				return;
			}
			if (roleIdList.includes(key)) {
				rankIdToRemove = key;
				rankNameToRemove = value.name;
			};
		});

		if (!noRoleChange) {
			// REMOVE OLD ROLE
			if (rankIdToRemove !== null) {
				const roleToRemove = interaction.guild.roles.cache.get(rankIdToRemove);
				await interaction.member.roles.remove(roleToRemove, "Rank Update by ToF-CS-Rank Bot");
				additionalMessage += "\nRemoving: " + roleToRemove.name + ".";
			}

			// ADD NEW ROLE
			const roleToAdd = interaction.guild.roles.cache.find(role => role.id == roleIdToGive);
			await interaction.member.roles.add(roleToAdd, "Rank Update by ToF-CS-Rank Bot");
			additionalMessage += "\nAdding: " + roleToAdd.name + ".";
		}
		return additionalMessage;
	}
}

function templateMatching(mat, scaleIndex, digit, interaction){
	var matchedDigits = [];

	// Read Digit Template
	file = "./templates/" + digit + ".jpg";
	var template = cv.imread(file);
	template = template.rescale(resolutions[scaleIndex].textScale);

	var result = mat.matchTemplate(template, 5);
	const dataList = result.getDataAsArray();
	var counter = 0;
	var largestXCoords = template.cols * -1; // Used to filter duplicates

	var threshold = 0.75;
	for (let y = 0; y < dataList.length; y++) {
		for (let x = 0; x < dataList[y].length; x++) {
			if (dataList[y][x] > threshold && x > (largestXCoords + (template.cols * sizeFilter))) {
				// For Debugging
				// mat.drawRectangle(
				// 	new cv.Rect(x, y, template.cols, template.rows),
				// 	new cv.Vec3(0, 255, 0),
				// 	2,
				// 	cv.LINE_4
				// );
				largestXCoords = x;
				matchedDigits.push({"xLoc": x, "digit": digit, "matsize": template.cols});
				counter++;
			}
		}
	}

	// For Debugging
	// outputBuffer = cv.imencode(".jpg", mat);
	// interaction.editReply({
	// 	content: `Matching ` + digit + `, found ` + counter + " matches",
	// 	files: [
	// 		{ attachment: outputBuffer }
	// 	],
	// 	ephemeral: false
	// });

	return matchedDigits;
}

function featureDetection(url, interaction){
	file = "./templates/1.png";
	var template = cv.imread(file);
	var templateKeyPts = detector.detect(template);
	var templateCompute = detector.compute(template, templateKeyPts);
	fs.readFile(url, (err, data) => {
		var unknown = cv.imdecode(data);
		var unknownKeyPts = detector.detect(unknown);
		var unknownComputed = detector.compute(unknown, unknownKeyPts);
		const bestN = 40;

		var result = new cv.matchBruteForceHamming(
			unknownComputed,
			templateCompute
		);

		const bestResults = result.sort(
			(result1, result2) => result1.distance - result2.distance)
			.slice(0, bestN);

			var score = 0
			bestResults.forEach((match) => {
				score += match.distance;
			})

			console.log(score);

			var output = cv.drawMatches(
				unknown,
				template,
				unknownKeyPts,
				templateKeyPts,
				bestResults
			)

			outputBuffer = cv.imencode(".jpg", output);
			interaction.editReply({
				content: `OCR:\n⁣`,
				files: [
					{ attachment: outputBuffer }
				],
				ephemeral: privateMessages
			});
	});
}

function getIndex(width, height){
	// Match Nearest height first, then match nearest Width
	var matchedHeight = heights.sort((a, b) => {
		return Math.abs(a - height) - Math.abs(b - height);
	})[0];
	var possibleResolutions = resolutions.filter((item) => {if (item.h === matchedHeight) return true})
	var extractedWidths = possibleResolutions.map((elem)=>(elem.w));
	var matchedWidth = extractedWidths.sort((a, b) => {
		return Math.abs(a - width) - Math.abs(b - width);
	})[0];
	return resolutions.findIndex((elem) => {if (elem.w == matchedWidth && elem.h == matchedHeight) return true})
}

function padTime(n){
	return ("" + n).padStart(2, 0)
}
function secondsToMinSec(time){
	return `${padTime(~~(time / 60))}:${padTime(time - ~~(time / 60) * 60)}`;
}

function download(url, userTag) {
	var fileType = url.split(".")[url.split(".").length - 1].toLowerCase();
	if (!validFileType.includes(fileType)){
		return "fds7890sadf7890Bot only accepts .png, or .jpg image files";
	}
	var dest = "./temp/" + userTag + "_" + new Date().getTime() + "." + fileType;
	return new Promise((resolve, reject) => {
		// Check file does not exist yet before hitting network
		fs.access(dest, fs.constants.F_OK, (err) => {

			if (err === null) reject('File already exists');

			const request = https.get(url, response => {
				if (response.statusCode === 200) {

					const file = fs.createWriteStream(dest, { flags: 'wx' });
					file.on('finish', () => resolve(dest));
					file.on('error', err => {
						file.close();
						if (err.code === 'EEXIST') reject('File already exists');
						else fs.unlink(dest, () => reject(err.message)); // Delete temp file
					});
					response.pipe(file);
				} else if (response.statusCode === 302 || response.statusCode === 301) {
					//Recursively follow redirects, only a 200 will resolve.
					download(response.headers.location, dest).then(() => resolve(dest));
				} else {
					reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
				}
			});

			request.on('error', err => {
				reject(err.message);
			});
		});
	});
}

var resolutions = [
	{
		"w": 3840,
		"h": 2160,
		"scale": 1.0,
		"textScale": 1.0,
	},
	{
		"w": 2560,
		"h": 1600,
		"scale": (1600 / 2160),
		"textScale": (1600 / 2160),
	},
	{
		"w": 2560,
		"h": 1440,
		"scale": (1440 / 2160),
		"textScale": (1440 / 2160),
	},
	{
		"w": 2048,
		"h": 1536,
		"scale": (1536 / 2160),
		"textScale": (1536 / 2160),
	},
	{
		"w": 1920,
		"h": 1440,
		"scale": (1440 / 2160),
		"textScale": (1440 / 2160),
	},
	{
		"w": 1920,
		"h": 1200,
		"scale": (1200 / 2160),
		"textScale": (1200 / 2160),
	},
	{
		"w": 1920,
		"h": 1080,
		"scale": (1080 / 2160),
		"textScale": (1080 / 2160),
	},
	{
		"w": 1680,
		"h": 1050,
		"scale": 0.4241,
		"textScale": 0.4241,
	},
	{
		"w": 1600,
		"h": 1200,
		"scale": (1200 / 2160),
		"textScale": (1200 / 2160),
	},
	{
		"w": 1600,
		"h": 1024,
		"scale": (1024 / 2160),
		"textScale": (1024 / 2160),
	},
	{
		"w": 1600,
		"h": 900,
		"scale": (900 / 2160),
		"textScale": (900 / 2160),
	},
	{
		"w": 1440,
		"h": 900,
		"scale": (900 / 2160),
		"textScale": (900 / 2160),
	},
	{
		"w": 1366,
		"h": 768,
		"scale": (768 / 2160),
		"textScale": (768 / 2160),
	},
	{
		"w": 1360,
		"h": 768,
		"scale": (768 / 2160),
		"textScale": (768 / 2160),
	},
	{
		"w": 1280,
		"h": 1024,
		"scale": (1024 / 2160),
		"textScale": (1024 / 2160),
	},
	{
		"w": 1280,
		"h": 960,
		"scale": (960 / 2160),
		"textScale": (960 / 2160),
	},
	{
		"w": 1280,
		"h": 800,
		"scale": (800 / 2160),
		"textScale": (800 / 2160),
	},
	{
		"w": 1280,
		"h": 768,
		"scale": (768 / 2160),
		"textScale": (768 / 2160),
	},
	{
		"w": 1280,
		"h": 720,
		"scale": (720 / 2160),
		"textScale": (720 / 2160),
	},
	{
		"w": 1080,
		"h": 720,
		"scale": (720 / 2160),
		"textScale": 0.3,
	},
	{
		"w": 2360,
		"h": 1640,
		"scale": 0.61,
		"textScale": 0.61,
	},
	{
		"w": 2880,
		"h": 1800,
		"scale": 0.75,
		"textScale": 0.75,
	},
]

var widths = [3840,
2880,
2560,
2360,
2048,
1920,
1680,
1600,
1440,
1366,
1360,
1280,
1080,]

var heights = [2160,
1800,
1640,
1600,
1440,
1536,
1440,
1200,
1080,
1050,
1200,
1024,
900,
900,
768,
768,
1024,
960,
800,
768,
720,
720]