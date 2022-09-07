const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('settings')
		.setDescription('Set Tof-CS-Rank-Settings')
		.addStringOption(option =>
			option.setName("rate_limit_in_seconds")
			.setDescription("Number of seconds before a user can submit another rank update")
			.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply();
		const guild_id = interaction.guild.id;
		const userTag = interaction.user.tag;
		const rateLimitInSeconds = interaction.options.getString('rate_limit_in_seconds');
		var DbClient = new MongoClient(mongoDBURI);
		await updateSettings(DbClient, guild_id, rateLimitInSeconds, userTag)
		try{
			await interaction.editReply('Settings updated');
		} catch (error) {
			console.error(error);
		}
		await DbClient.close();
	},
};

async function updateSettings(DbClient, guild_id, rateLimitInSeconds, userTag){
	try{
		console.log("updating settings");
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('settings');

		const filter = { guild_id: guild_id };
		const options = { upsert: true };

		const doc = {
			$set: {
				guild_id: guild_id,
				rateLimitInSeconds: rateLimitInSeconds,
				lastUpdate: new Date(),
				setBy: userTag
			},
		}

		const result = await records.updateOne(filter, doc, options);
	} catch (error) {
		console.error(error);
	} finally { }
}