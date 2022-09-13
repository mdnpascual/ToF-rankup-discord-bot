const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { mongoDBURI } = require('./../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rerank')
		.setDescription('Rerank everyone if ranks are updated with /setrank command')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({
			ephemeral: false
		});
		const guild_id = interaction.guild.id;
		var DbClient = new MongoClient(mongoDBURI);
		var users = await getGuildUsers(DbClient, guild_id)
		var rankingCutoff = await getRankingCutoffs(DbClient, guild_id);
		var sortedRankingCutoff = rankingCutoff.sort((a,b) => parseInt(b.min_cs) - parseInt(a.min_cs));

		var fields = [];
		for (const user of users){
			var field = await updateRoles(DbClient, user.CS, user.discord_tag, guild_id, sortedRankingCutoff, interaction)
			if (field !== null){
				fields.push(field);
			}
		}

		if(fields.length ==0){
			fields.push({
				name: "Result",
				value: "No rank changes needed",
				inline: false
			})
		}

		var embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle("Rerank Results for " + interaction.guild.name)
			.addFields(fields);

		try{
			await interaction.editReply({
				embeds: [embed],
				ephemeral: false
			});
		} catch (error) {
			console.error(error);
		}

		await DbClient.close();
	},
};

async function getGuildUsers(DbClient, guild_id){
	try{
		console.log("fetching ranks");
		const database = DbClient.db('ToF-RankUp-DB');
		const ranks = database.collection('records');

		const query = { guild_id: guild_id }
		return await ranks.find(query).toArray();
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

async function updateRoles(DbClient, score, tag, guild_id, rankingCutoff, interaction) {
	var user = await interaction.guild.members.fetch({query: tag.split("#")[0], limit: 1, force: true});
	user = user.first();

	try{
		var userRoles = user.roles.cache;
	} catch (exception){
		// DELETE
		await removeUser(DbClient, tag, guild_id);

		return additionalMessage == "" ? null : {
			name: tag,
			value: "User not found. Deleting in leaderboards",
			inline: false
		}
	}

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

	return additionalMessage == "" ? null : {
		name: tag,
		value: additionalMessage,
		inline: false
	}
}