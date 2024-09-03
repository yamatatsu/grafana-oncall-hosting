-- CreateTable
CREATE TABLE `IotData` (
    `iotDataId` INTEGER NOT NULL AUTO_INCREMENT,
    `dataName` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `value` DOUBLE NOT NULL,

    UNIQUE INDEX `IotData_timestamp_dataName_key`(`timestamp`, `dataName`),
    PRIMARY KEY (`iotDataId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
