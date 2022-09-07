const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('remove')
		.setDescription('Deletes a user from the leaderboard')
		.addUserOption(option =>
			option.setName("user")
			.setDescription("The user do to be edited")
			.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply();
		const guild_id = interaction.guild.id;
		const user = interaction.options.getUser('user');
		const userTag = user.tag;
		const setBy = interaction.user.tag;

		var DbClient = new MongoClient(mongoDBURI);
		await removeUser(DbClient, userTag, guild_id)
		try{
			await interaction.editReply("Deleting record of  " + userTag);
		} catch (error) {
			console.error(error);
		}
		await DbClient.close();
	},
};

async function removeUser(DbClient, tag, guild_id)
{
	try{
		const database = DbClient.db('ToF-RankUp-DB');
		const records = database.collection('records');

		const query = { discord_tag: tag, guild_id: guild_id }
		const userRecord = await records.deleteOne(query);

		return userRecord;
	} catch (error) {
		console.error(error);
	} finally { }
}