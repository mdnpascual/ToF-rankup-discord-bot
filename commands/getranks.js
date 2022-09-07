const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('getranks')
		.setDescription('Get CS Cutoff per Rank')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply();
		const guild_id = interaction.guild.id;

		var DbClient = new MongoClient(mongoDBURI);
		var rankCutoffData = await getRankingCutoffs(DbClient, guild_id)

		var sorted = rankCutoffData.sort((a,b) => parseInt(a.min_cs) - parseInt(b.min_cs));
		var embedData = await embedBuilder(sorted, interaction)
		await DbClient.close();

		try{
			await interaction.editReply({
				embeds: [embedData],
				ephemeral: false
			});
		} catch (error) {
			console.error(error);
		}
	},
};

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

async function embedBuilder(sorted, interaction){
	var fields = [];
	for(i = 0; i < sorted.length; i++){
		var rank = await interaction.member.guild.roles.fetch(sorted[i].roleId);
		fields.push({
			name: rank.name,
			value: sorted[i].min_cs.toString() + "+",
			inline: true});
	}

	return new EmbedBuilder()
		.setColor(0xff0000)
		.setTitle("Rank Cutoffs for " + interaction.guild.name)
		.addFields(fields);
}