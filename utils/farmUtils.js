function getPlayerCapacity(client, userId, guildId) {
    const userData = client.getLevel.get(userId, guildId) || {};
    const userLevel = userData.level || 0;
    
    if (userLevel <= 5) return 30;
    if (userLevel <= 10) return 80;
    if (userLevel <= 20) return 150;
    if (userLevel <= 30) return 250;
    if (userLevel <= 40) return 350;
    if (userLevel <= 50) return 500;
    if (userLevel <= 60) return 600;
    if (userLevel <= 70) return 700;
    if (userLevel <= 80) return 800;
    return 1000;
}

module.exports = { getPlayerCapacity };
