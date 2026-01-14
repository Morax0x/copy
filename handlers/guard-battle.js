const { EmbedBuilder, Colors } = require("discord.js");

// ✅✅✅ التصحيح: الاستيراد من pvp-core.js حيث توجد الدوال المطلوبة (getWeaponData, etc) ✅✅✅
const { 
    activePveBattles, 
    buildBattleEmbed, 
    BASE_HP, 
    HP_PER_LEVEL, 
    getWeaponData, 
    getAllSkillData,
    calculateDamage,
    applyPersistentEffects,
} = require('./pvp-core'); 

const GUARD_IMAGE_MAIN = 'https://i.postimg.cc/d1ndBX7B/download.gif'; 

async function startGuardBattle(interaction, client, sql, robberMember, amountToSteal) {
    const getLevel = client.getLevel;
    // حماية إضافية: إذا لم توجد بيانات، استخدم القيم الافتراضية
    let robberData = getLevel.get(robberMember.id, interaction.guild.id) || { ...client.defaultData, user: robberMember.id, guild: interaction.guild.id };
    
    // 1. حساب قوة اللاعب (السارق)
    const pMaxHp = BASE_HP + (robberData.level * HP_PER_LEVEL);
    
    // استدعاء دالة السلاح (التي كانت تسبب المشكلة)
    let robberWeapon = getWeaponData(sql, robberMember);
    if (!robberWeapon || robberWeapon.currentLevel === 0) {
        robberWeapon = { name: "قبضة يد", currentDamage: 15 };
    }

    // 2. إنشاء الحارس
    const guardMaxHp = pMaxHp; 
    const guardDamage = robberWeapon.currentDamage; 

    const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

    const battleState = {
        isPvE: true,
        isGuardBattle: true, 
        amountToSteal: amountToSteal,
        message: null, 
        turn: [robberMember.id, "guard"], 
        log: [`🛡️ **فارس الامبراطور** اعترض طريقك! قاتل للهروب بالغنيمة!`], 
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
                name: "فارس الامبراطور", 
                hp: guardMaxHp, 
                maxHp: guardMaxHp, 
                weapon: { name: "السيف المقدس", currentDamage: guardDamage }, 
                skills: {}, 
                effects: defEffects() 
            }]
        ])
    };

    activePveBattles.set(interaction.channel.id, battleState);
    
    const introEmbed = new EmbedBuilder()
        .setTitle('🚨 كشفك الفــارس!')
        .setDescription(`**${robberMember}** توقف مكانــك! \nعليك هزيمتي أولاً إذا أردت الهروب من قصر الامبراطور بـ **${amountToSteal.toLocaleString()}** مـورا!`)
        .setColor(Colors.DarkRed)
        .setImage(GUARD_IMAGE_MAIN); 

    const { embeds: battleEmbeds, components } = buildBattleEmbed(battleState);
    
    // التعامل مع الرد سواء كان Interaction (Slash) أو Message (Prefix)
    let msgPayload = { 
        content: `⚔️ **بدأ القتال!** ${robberMember}`, 
        embeds: [introEmbed, ...battleEmbeds], 
        components 
    };

    if (interaction.reply && typeof interaction.reply === 'function') {
        // إذا كان Slash Command
        if (!interaction.replied && !interaction.deferred) {
            battleState.message = await interaction.reply({ ...msgPayload, fetchReply: true });
        } else {
            battleState.message = await interaction.followUp(msgPayload);
        }
    } else {
        // إذا كان Message عادي
        battleState.message = await interaction.channel.send(msgPayload);
    }
}

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
    battleState.log.push(`**الفارس** ضربك بسيفه وسبب **${dmg}** ضرر!`);

    if (player.hp <= 0) {
        return await handleGuardBattleEnd(battleState, "guard", "lose");
    }

    battleState.turn = [playerMemberId, "guard"];
    
    const { embeds: updateEmbeds, components: updateComponents } = buildBattleEmbed(battleState);
    await battleState.message.edit({ embeds: updateEmbeds, components: updateComponents });
}

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

        embed.setTitle(`🏆 هزمت الفارس وهربت بالغنيمة!`)
             .setColor(Colors.Green)
             .setDescription(`تمكنت من الفرار ومعك **${amount.toLocaleString()}**! 💰`)
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

        embed.setTitle(`💀 تـم القبـض!`)
             .setColor(Colors.Red)
             .setDescription(`قـتلك فـارس الامبراطـور وخسـرت **${amount.toLocaleString()}** مورا.`)
             .setImage(GUARD_IMAGE_MAIN); 
    }

    await battleState.message.edit({ components: [] });
    await battleState.message.channel.send({ content: `${player.member}`, embeds: [embed] });
}

module.exports = { startGuardBattle, processGuardTurn };
