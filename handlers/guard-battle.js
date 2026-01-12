const { EmbedBuilder, Colors } = require("discord.js");
const { 
    activePveBattles, 
    buildBattleEmbed, 
    cleanDisplayName, 
    BASE_HP, 
    HP_PER_LEVEL, 
    getWeaponData, 
    getAllSkillData,
    calculateDamage,
    applyPersistentEffects,
} = require('../dungeon/core/battle-utils'); // ⚠️ تأكد من مسار battle-utils

// ✅ تم تحديث صور الحارس
const GUARD_IMAGE_MAIN = 'https://i.postimg.cc/d1ndBX7B/download.gif'; // الصورة الجديدة

const GUARD_IMAGES = [
    GUARD_IMAGE_MAIN,
    'https://media.giphy.com/media/3o7TKs789ha4QYJq9i/giphy.gif',
    'https://media.giphy.com/media/l0HlO3BJ8L9l7TJQI/giphy.gif'
];

/**
 * بدء معركة ضد الحارس
 */
async function startGuardBattle(interaction, client, sql, robberMember, amountToSteal) {
    const getLevel = client.getLevel;
    let robberData = getLevel.get(robberMember.id, interaction.guild.id);
    
    // 1. حساب قوة اللاعب (السارق)
    const pMaxHp = BASE_HP + (robberData.level * HP_PER_LEVEL);
    let robberWeapon = getWeaponData(sql, robberMember);
    if (!robberWeapon || robberWeapon.currentLevel === 0) {
        robberWeapon = { name: "قبضة يد", currentDamage: 15 };
    }

    // 2. إنشاء الحارس (نسخة من قوة اللاعب)
    const guardMaxHp = pMaxHp; 
    const guardDamage = robberWeapon.currentDamage; 

    const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

    const battleState = {
        isPvE: true,
        isGuardBattle: true, 
        amountToSteal: amountToSteal,
        message: null, 
        turn: [robberMember.id, "guard"], 
        log: [`🛡️ **الحارس الملكي** اعترض طريقك! قاتل للهروب بالغنيمة!`], 
        skillPage: 0, 
        processingTurn: false,
        skillCooldowns: { [robberMember.id]: {}, "guard": {} },
        players: new Map([
            [robberMember.id, { 
                isMonster: false, 
                member: robberMember, 
                hp: pMaxHp, 
                maxHp: pMaxHp, 
                weapon: robberWeapon, 
                skills: getAllSkillData(sql, robberMember), 
                effects: defEffects() 
            }],
            ["guard", { 
                isMonster: true, 
                name: "👮 الحارس الملكي", 
                hp: guardMaxHp, 
                maxHp: guardMaxHp, 
                weapon: { name: "سيف العدالة", currentDamage: guardDamage }, 
                skills: {}, 
                effects: defEffects() 
            }]
        ])
    };

    activePveBattles.set(interaction.channel.id, battleState);
    
    // ✅ إيمبد خاص لظهور الحارس مع الصورة الجديدة
    const introEmbed = new EmbedBuilder()
        .setTitle('🚨 كشفك الحــارس!')
        .setDescription(`**${robberMember}** توقف مكانك! \nعليك هزيمتي أولاً إذا أردت الهروب بـ **${amountToSteal.toLocaleString()}** عملة!`)
        .setColor(Colors.DarkRed)
        .setImage(GUARD_IMAGE_MAIN); // 🔥 الصورة هنا

    // جلب أزرار وشريط الصحة للمعركة
    const { embeds: battleEmbeds, components } = buildBattleEmbed(battleState);
    
    // إرسال رسالة المعركة (الإيمبد التعريفي + إيمبد القتال)
    battleState.message = await interaction.channel.send({ 
        content: `⚔️ **بدأ القتال!** ${robberMember}`, 
        embeds: [introEmbed, ...battleEmbeds], 
        components 
    });
}

/**
 * معالجة دور الحارس (AI)
 */
async function processGuardTurn(battleState) {
    const guard = battleState.players.get("guard");
    const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
    const player = battleState.players.get(playerMemberId);

    const { logEntries, skipTurn } = applyPersistentEffects(battleState, "guard");
    battleState.log.push(...logEntries);

    if (guard.hp <= 0) {
        return await handleGuardBattleEnd(battleState, playerMemberId, "win");
    }

    if (skipTurn) {
        battleState.turn = [playerMemberId, "guard"];
        const { embeds, components } = buildBattleEmbed(battleState);
        await battleState.message.edit({ embeds, components });
        return;
    }

    const dmg = calculateDamage(guard, player);
    player.hp -= dmg;
    battleState.log.push(`👮 **الحارس** ضربك بسيفه وسبب **${dmg}** ضرر!`);

    if (player.hp <= 0) {
        return await handleGuardBattleEnd(battleState, "guard", "lose");
    }

    battleState.turn = [playerMemberId, "guard"];
    
    const { embeds: updateEmbeds, components: updateComponents } = buildBattleEmbed(battleState);
    await battleState.message.edit({ embeds: updateEmbeds, components: updateComponents });
}

/**
 * إنهاء معركة الحارس
 */
async function handleGuardBattleEnd(battleState, winnerId, resultType) {
    const client = battleState.message.client;
    const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
    const player = battleState.players.get(playerMemberId);
    
    const setScore = client.setLevel;
    const getScore = client.getLevel;
    
    let playerData = getScore.get(player.member.id, battleState.message.guild.id);
    const amount = battleState.amountToSteal;

    const embed = new EmbedBuilder();
    activePveBattles.delete(battleState.message.channel.id);

    if (resultType === "win") {
        playerData.mora += amount;
        setScore.run(playerData);

        embed.setTitle(`🏆 هزمت الحارس وهربت بالغنيمة!`)
             .setColor(Colors.Green)
             .setDescription(`تمكنت من الفرار ومعك **${amount.toLocaleString()}** عملة! 💰`)
             .setImage('https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif'); 
    } else {
        if (playerData.mora >= amount) {
            playerData.mora -= amount;
        } else {
            const remaining = amount - playerData.mora;
            playerData.mora = 0;
            playerData.bank = Math.max(0, playerData.bank - remaining);
        }
        setScore.run(playerData);

        embed.setTitle(`💀 تم القبض عليك!`)
             .setColor(Colors.Red)
             .setDescription(`طرحك الحارس أرضاً! تمت مصادرة **${amount.toLocaleString()}** عملة كغرامة.`)
             .setImage(GUARD_IMAGE_MAIN); // 🔥 نستخدم نفس الصورة عند الخسارة
    }

    await battleState.message.edit({ components: [] });
    await battleState.message.channel.send({ content: `${player.member}`, embeds: [embed] });
}

module.exports = { startGuardBattle, processGuardTurn };
