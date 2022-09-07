const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setranks')
		.setDescription('Set minimum CS per Rank')
		.addRoleOption(option =>
			option.setName("rankrole")
			.setDescription("The role to be given for when the ser cs is achieved")
			.setRequired(true))
		.addIntegerOption(option =>
			option.setName("min_cs")
			.setDescription("Minium CS needed to attain the rank")
			.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply();
		const guild_id = interaction.guild.id;
		const min_cs = interaction.options.getInteger('min_cs');
		const rankRole = interaction.options.getRole('rankrole');
		const userTag = interaction.user.tag;

		var DbClient = new MongoClient(mongoDBURI);
		await updateRanking(DbClient, guild_id, min_cs, userTag, rankRole.id)
		try{
			await interaction.editReply("Ranking for " +  rankRole.name + " updated to require " + min_cs + " CS");
		} catch (error) {
			console.error(error);
		}
		await DbClient.close();
	},
};

async function updateRanking(DbClient, guild_id, min_cs, userTag, roleId){
	try{
		console.log("updating ranks");
		const database = DbClient.db('ToF-RankUp-DB');
		const ranks = database.collection('ranks');

		const filter = { guild_id: guild_id, roleId: roleId };
		const options = { upsert: true };

		const doc = {
			$set: {
				guild_id: guild_id,
				min_cs: min_cs,
				roleId: roleId,
				lastUpdate: new Date(),
				setBy: userTag
			},
		}

		const result = await ranks.updateOne(filter, doc, options);
	} catch (error) {
		console.error(error);
	} finally { }
}