// seed.js — заполняет БД начальными данными
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.petition.deleteMany();
    await prisma.vote.deleteMany();

    await prisma.petition.createMany({
        data: [
            {
                title: "Благоустройство парка в нашем районе",
                description: "Требуется обновить лавочки, урны и установить освещение в парке №3.",
                category: "Городская среда",
                region: "Ошская область",
                authorName: "Аноним"
            },
            {
                title: "Решение проблемы мусора у школы №5",
                description: "Установить дополнительные контейнеры и организовать вывоз мусора.",
                category: "Образование / Инфраструктура",
                region: "Чуйская область",
                authorName: "Иван"
            },
            {
                title: "Поддержка локальных стартапов",
                description: "Создать гранты для молодых IT-команд в регионе.",
                category: "Экономика",
                region: "Бишкек",
                authorName: "S. K."
            }
        ]
    });

    console.log("Seed completed.");
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
