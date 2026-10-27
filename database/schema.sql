-- Training Management ERP - SQL Server schema
IF DB_ID('OgrenciEgitimDB') IS NULL CREATE DATABASE OgrenciEgitimDB;
GO
USE OgrenciEgitimDB;
GO

-- Application users (passwords are stored as bcrypt hashes)
CREATE TABLE Kullanicilar (
    ID           INT IDENTITY(1,1) PRIMARY KEY,
    KullaniciAdi NVARCHAR(50)  NOT NULL UNIQUE,
    SifreHash    NVARCHAR(100) NOT NULL,
    AdSoyad      NVARCHAR(100) NOT NULL,
    Rol          NVARCHAR(30)  NOT NULL DEFAULT N'Admin',
    SonGiris     DATETIME      NULL
);

-- Personnel
CREATE TABLE Personel (
    ID        INT IDENTITY(1,1) PRIMARY KEY,
    TC        NVARCHAR(11)  NOT NULL UNIQUE,
    AdSoyad   NVARCHAR(100) NOT NULL,
    Departman NVARCHAR(60)  NULL,
    Gorev     NVARCHAR(60)  NULL,
    Email     NVARCHAR(120) NULL,
    Durum     NVARCHAR(20)  NOT NULL DEFAULT N'Aktif'
);

-- Training sessions
CREATE TABLE Egitimler (
    ID         INT IDENTITY(1,1) PRIMARY KEY,
    EgitimAdi  NVARCHAR(150) NOT NULL,
    Kategori   NVARCHAR(60)  NULL,
    Tarih      DATE          NOT NULL,
    Butce      DECIMAL(12,2) NULL,
    Egitmen    NVARCHAR(100) NULL,
    Durum      NVARCHAR(20)  NOT NULL DEFAULT N'Planlandı'
);

-- Participation (personnel <-> training)
CREATE TABLE EgitimKatilim (
    EgitimID      INT NOT NULL REFERENCES Egitimler(ID) ON DELETE CASCADE,
    PersonelID    INT NOT NULL REFERENCES Personel(ID)  ON DELETE CASCADE,
    KatilimDurumu NVARCHAR(20) NOT NULL DEFAULT N'Atandı',
    PRIMARY KEY (EgitimID, PersonelID)
);
GO
