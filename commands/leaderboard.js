const {
	EmbedBuilder,
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle} = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('List of Whales'),
	async execute(interaction) {
		const guild = interaction.guild.id;
		var DbClient = new MongoClient(mongoDBURI);
		if (interaction.isChatInputCommand()){
			await interaction.deferReply();
			await listLeaderboardDefault(DbClient, interaction, guild);
		} else if (interaction.isButton()){
			await interaction.deferUpdate();
			var title = interaction.message.embeds[0].data.title;
			var range = title.split("Leaderboard rankings (")[1].split(")")[0].split("-");
			await listLeaderboard(DbClient, interaction, guild, parseInt(range[0]), parseInt(range[1]), interaction.customId.split("::")[1]);
		}
		await DbClient.close();
	},
};

async function listLeaderboardDefault(DbClient, interaction, guild_id){
	await listLeaderboard(DbClient, interaction, guild_id, 1, 10, "")
}

async function listLeaderboard(DbClient, interaction, guild_id, min, max, buttonID){
	var errors = [];

	try{
		var allUsers = await getUsers(DbClient, guild_id)
		var sorted = allUsers.sort((a,b) => parseInt(b.CS) - parseInt(a.CS));

		if(buttonID == "nextButton"){
			min = min + 10
			max = clamp(max + 10, 10, sorted.length);
		}
		if(buttonID == "backButton"){
			min = clamp(min - 10, 1, 1000);
			max = clamp(max - 10, 10, 1000);
		}

		var embedData = embedBuilder(sorted, min, max, interaction);
		var buttons = buttonBuilder(min, max, sorted.length);

		await interaction.editReply({
			embeds: [embedData],
			components: [buttons],
			ephemeral: false
		});
	} catch (error) {
		console.error(error);
	}  finally { }
}

async function getUsers(DbClient, guild_id)
{
	try{
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('records');

		const query = { guild_id: guild_id }
		const allUsers = await records.find(query).toArray();
		return allUsers;
	} catch (error) {
		console.error(error);
	} finally { }
}

function embedBuilder(sorted, min, max, interaction){

	var fields = [];
	var maxLength = sorted.length > 10 ? max : sorted.length
	for(i = min; i < maxLength + 1; i++){
		fields.push({name: i + ": " + sorted[i-1].discord_tag, value: parseInt(sorted[i-1].CS).toString()});
	}

	return new EmbedBuilder()
		.setColor(0x0099FF)
		.setTitle("Leaderboard rankings (" + min + "-" + max+") for " + interaction.guild.name)
		.addFields(fields);
}

function clamp(number, min, max) {
	return Math.max(min, Math.min(number, max));
}

function buttonBuilder(min, max, dataLength){
	return new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('leaderboard::backButton')
				.setLabel('⇐')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(min < 10))
		.addComponents(
			new ButtonBuilder()
			.setCustomId('leaderboard::nextButton')
			.setLabel('⇒')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(dataLength <= max)
		);
}