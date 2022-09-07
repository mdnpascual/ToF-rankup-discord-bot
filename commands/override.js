const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('override')
		.setDescription("Manually set a user's CS score")
		.addUserOption(option =>
			option.setName("user")
			.setDescription("The user do to be edited")
			.setRequired(true))
		.addIntegerOption(option =>
			option.setName("score")
			.setDescription("score to be set")
			.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply();
		const guild_id = interaction.guild.id;
		const score = interaction.options.getInteger('score');
		const user = interaction.options.getUser('user');
		const discord_tag = user.tag;
		const setBy = interaction.user.tag;

		var DbClient = new MongoClient(mongoDBURI);
		var message = await updateScore(DbClient, interaction, guild_id, score, discord_tag)
		try{
			await interaction.editReply("Overriding score for Ranking for " +  discord_tag + " with " + score + " CS. " + message);
		} catch (error) {
			console.error(error);
		}
		await DbClient.close();
	},
};

async function updateScore(DbClient, interaction, guild_id, score, discord_tag){
	var userData = await getUser(DbClient, discord_tag, guild_id);
	var rankingCutoff = await getRankingCutoffs(DbClient, guild_id);
	var sortedRankingCutoff = rankingCutoff.sort((a,b) => parseInt(b.min_cs) - parseInt(a.min_cs));

	await updateUser(DbClient, score, discord_tag, guild_id, interaction.user.tag)
	return await updateRoles(score, discord_tag, sortedRankingCutoff, interaction);
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

async function updateRoles(score, tag, rankingCutoff, interaction) {
	var user = await interaction.guild.members.fetch({query: tag.split("#")[0], limit: 1, force: true});
	user = user.first();

	var userRoles = user.roles.cache;

	var rankList = rankingCutoff.map((rank) => rank.min_cs);
	var rankListindexFound = rankList.findIndex(rankScore => score >= rankScore);
	var roleIdToGive = rankingCutoff[rankListindexFound].roleId;
	var roleIdList = rankingCutoff.map((rank) => rank.roleId);

	var rankIdToRemove = null;
	var rankNameToRemove = null;
	var noRoleChange = false;
	var additionalMessage = "";
	userRoles.forEach((value, key) => {
		if (roleIdToGive === key) {
			// additionalMessage += "No updates in Rank.";
			noRoleChange = true;
			return;
		}
		if (roleIdList.includes(key)) {
			rankIdToRemove = key;
			rankNameToRemove = value.name;
		};
	});

	if (!noRoleChange) {
		var originalPosition = 0;
		var newPosition = 0;
		// REMOVE OLD ROLE

		if (rankIdToRemove !== null) {
			const roleToRemove = interaction.guild.roles.cache.get(rankIdToRemove);
			await user.roles.remove(roleToRemove, "Rank Update by ToF-CS-Rank Bot");
			originalPosition = roleToRemove.rawPosition
		}

		// ADD NEW ROLE
		const roleToAdd = interaction.guild.roles.cache.find(role => role.id == roleIdToGive);
		await user.roles.add(roleToAdd, "Rank Update by ToF-CS-Rank Bot");
		newPosition = roleToAdd.rawPosition;

		if(originalPosition > newPosition){
			additionalMessage += "Demoted to " + roleToAdd.name;
		} else {
			additionalMessage += "Promoted to " + roleToAdd.name;
		}
	}

	return additionalMessage;
}