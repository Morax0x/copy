const { SlashCommandBuilder } = require("discord.js");
module.exports = {
    data: new SlashCommandBuilder().setName('dungeon').setDescription('Test'),
    async execute(interaction) { await interaction.reply('Test'); }
};
