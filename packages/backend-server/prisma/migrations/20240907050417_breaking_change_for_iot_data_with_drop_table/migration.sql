-- DropTable
DROP TABLE `IotData`;

-- CreateTable
CREATE TABLE `IotData` (
    `iotDataId` INTEGER NOT NULL AUTO_INCREMENT,
    `gatewayName` VARCHAR(191) NOT NULL,
    `time` DATETIME(3) NOT NULL,
    `devices` JSON NOT NULL,

    UNIQUE INDEX `IotData_time_gatewayName_key`(`time`, `gatewayName`),
    PRIMARY KEY (`iotDataId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
