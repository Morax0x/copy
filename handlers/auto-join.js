const { joinVoiceChannel } = require('@discordjs/voice');
const { ActivityType } = require('discord.js');

module.exports = async (client) => {
    const db = client.db;

    console.log("🔄 [Auto-Join] Checking saved voice channels and status...");

    try {
        const savedStatusRes = await db.query("SELECT savedstatustype, savedstatustext FROM settings WHERE savedstatustext IS NOT NULL LIMIT 1");
        const savedStatus = savedStatusRes.rows[0];
        
        if (savedStatus) {
            let type = ActivityType.Playing;
            if (savedStatus.savedstatustype === 'Watching') type = ActivityType.Watching;
            else if (savedStatus.savedstatustype === 'Listening') type = ActivityType.Listening;
            else if (savedStatus.savedstatustype === 'Streaming') type = ActivityType.Streaming;
            else if (savedStatus.savedstatustype === 'Competing') type = ActivityType.Competing;
            else if (savedStatus.savedstatustype === 'Custom') type = ActivityType.Custom;

            if (type === ActivityType.Custom) {
                client.user.setPresence({
                    activities: [{ name: savedStatus.savedstatustext, type: type, state: savedStatus.savedstatustext }],
                    status: 'online'
                });
            } else {
                client.user.setPresence({
                    activities: [{ name: savedStatus.savedstatustext, type: type }],
                    status: 'online'
                });
            }
            console.log(`✅ [Status] Restored: ${savedStatus.savedstatustype} ${savedStatus.savedstatustext}`);
        }
    } catch (e) {
        console.error("[Auto-Join] Error restoring status:", e.message);
    }

    try {
        const settingsRes = await db.query("SELECT guild, voicechannelid FROM settings WHERE voicechannelid IS NOT NULL");
        const settings = settingsRes.rows;

        for (const data of settings) {
            const guild = client.guilds.cache.get(data.guild);
            if (!guild) continue;

            const channel = guild.channels.cache.get(data.voicechannelid);
            if (!channel || !channel.isVoiceBased()) {
                await db.query("UPDATE settings SET voicechannelid = NULL WHERE guild = $1", [data.guild]);
                continue;
            }

            try {
                joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });
                console.log(`✅ [Voice] Rejoined channel ${channel.name} in ${guild.name}`);
            } catch (error) {
                console.error(`❌ [Voice] Failed to join ${channel.name}:`, error.message);
            }
        }
    } catch (e) {
        console.error("[Auto-Join] Error restoring voice connection:", e.message);
    }
};
