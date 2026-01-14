const { EmbedBuilder, Colors } = require("discord.js");

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

// دالة مساعدة لتعديل شكل الايمبد ليناسب الفارس في كل دور
function fixGuardEmbed(embed) {
    if (!embed) return;
    // تغيير العنوان
    embed.setTitle('⚔️ معركة ضد فارس الامبراطور');
    // وضع صورة الفارس الكبيرة داخل الايمبد نفسه
    embed.setImage(GUARD_IMAGE_MAIN);
    // إزالة الصورة المصغرة (Thumbnail) لتجنب التكرار او الشكل السيء
    embed.setThumbnail(null);
    // تعديل اللون
    embed.setColor(Colors.DarkRed);
    return embed;
}

async function startGuardBattle(interaction, client, sql, robberMember, amountToSteal) {
    const getLevel = client.getLevel;
    let robberData = getLevel.get(robberMember.id, interaction.guild.id) || { ...client.defaultData, user: robberMember.id, guild: interaction.guild.id };
    
    // 1. حساب قوة اللاعب
    const pMaxHp = BASE_HP + (robberData.level * HP_PER_LEVEL);
    
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
    
    // بناء الايمبد الأساسي
    const { embeds: battleEmbeds, components } = buildBattleEmbed(battleState);
    
    // 🔥🔥 تعديل الايمبد ليحمل صورة واسم الفارس 🔥🔥
    const finalEmbed = fixGuardEmbed(battleEmbeds[0]);

    try {
        const sentMsg = await interaction.channel.send({ 
            content: `⚔️ **بدأ القتال!** <@${robberMember.id}>`, 
            embeds: [finalEmbed], // نرسل الايمبد المعدل فقط
            components: components
        });
        
        battleState.message = sentMsg;
        
    } catch (error) {
        console.error("Error sending guard battle message:", error);
        activePveBattles.delete(interaction.channel.id);
    }
}

async function processGuardTurn(battleState) {
    const guard = battleState.players.get("guard");
    const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
    const player = battleState.players.get(playerMemberId);

    // تطبيق التأثيرات المستمرة
    const { logEntries, skipTurn } = applyPersistentEffects(battleState, "guard");
    battleState.log.push(...logEntries);

    // التحقق من موت الفارس قبل دوره
    if (guard.hp <= 0) {
        return await handleGuardBattleEnd(battleState, playerMemberId, "win");
    }

    // إذا تم تخطي الدور (بسبب شلل مثلاً)
    if (skipTurn) {
        battleState.turn = [playerMemberId, "guard"]; // إعادة الدور للاعب
        const { embeds, components } = buildBattleEmbed(battleState);
        // 🔥 تحديث الايمبد مع التعديل 🔥
        await battleState.message.edit({ embeds: [fixGuardEmbed(embeds[0])], components });
        return;
    }

    // هجوم الفارس
    const dmg = calculateDamage(guard, player);
    player.hp -= dmg;
    battleState.log.push(`**الفارس** ضربك بسيفه وسبب **${dmg}** ضرر!`);

    // التحقق من موت اللاعب
    if (player.hp <= 0) {
        return await handleGuardBattleEnd(battleState, "guard", "lose");
    }

    // إعادة الدور للاعب
    battleState.turn = [playerMemberId, "guard"];
    
    const { embeds: updateEmbeds, components: updateComponents } = buildBattleEmbed(battleState);
    
    // 🔥 تحديث الايمبد مع التعديل لضمان بقاء الصورة والاسم 🔥
    await battleState.message.edit({ 
        embeds: [fixGuardEmbed(updateEmbeds[0])], 
        components: updateComponents 
    });
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
    // إرسال النتيجة
    await battleState.message.channel.send({ content: `<@${player.member.id}>`, embeds: [embed] });
}

module.exports = { startGuardBattle, processGuardTurn };
