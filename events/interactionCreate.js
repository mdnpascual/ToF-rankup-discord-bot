const { Client, Collection, ButtonInteraction, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
	name: 'interactionCreate',
	/**
	 * @param {ButtonInteraction} interaction
	 */
	async execute(interaction) {
		if(!interaction.isButton()) return

		const client = new Client({ intents: [GatewayIntentBits.Guilds] });
		client.commands = new Collection();
		const commandsPath = path.join(__dirname, './../commands');
		const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

		for (const file of commandFiles) {
			const filePath = path.join(commandsPath, file);
			const command = require(filePath);
			client.commands.set(command.data.name, command);
		}

		var commandName = interaction.customId.split("::")[0];
		const command = client.commands.get(commandName);

		try{
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	},
};