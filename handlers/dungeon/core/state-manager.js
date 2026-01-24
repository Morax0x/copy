// handlers/dungeon/core/state-manager.js

function saveDungeonState(sql, channelID, guildID, hostID, state) {
    // التأكد من أن قاعدة البيانات متصلة
    if (!sql || !sql.open) return;
    
    const data = JSON.stringify(state);
    sql.prepare(`
        INSERT OR REPLACE INTO active_dungeons (channelID, guildID, hostID, data)
        VALUES (?, ?, ?, ?)
    `).run(channelID, guildID, hostID, data);
}

function deleteDungeonState(sql, channelID) {
    if (!sql || !sql.open) return;
    
    sql.prepare("DELETE FROM active_dungeons WHERE channelID = ?").run(channelID);
}

module.exports = { saveDungeonState, deleteDungeonState };
