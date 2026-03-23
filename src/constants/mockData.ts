/**
 * Mock article data embedded as a constant string.
 * Domain: Textil — each barcode represents a roll of fabric.
 * - cod_articulo: encodes fabric type + color (e.g., ALG-BLA = Algodón Blanco)
 * - descripcion: fabric type (e.g., Algodón, Poliéster)
 * - color: color of the fabric
 * - peso_nominal: weight of the roll in kg
 *
 * Source: assets/mock_articles.csv (kept in sync)
 */
export const MOCK_ARTICLES_CSV = `id_barra,cod_articulo,descripcion,peso_nominal,color
7790001000011,ALG-BLA,Algodón,12.5,Blanco
7790001000028,ALG-BLA,Algodón,11.8,Blanco
7790001000035,ALG-BLA,Algodón,13.2,Blanco
7790001000042,ALG-NEG,Algodón,10.0,Negro
7790001000059,ALG-NEG,Algodón,12.0,Negro
7790001000066,ALG-ROJ,Algodón,14.5,Rojo
7790001000073,ALG-ROJ,Algodón,13.8,Rojo
7790001000080,ALG-AZU,Algodón,11.0,Azul
7790001000097,POL-BLA,Poliéster,8.5,Blanco
7790001000103,POL-BLA,Poliéster,9.2,Blanco
7790001000110,POL-BLA,Poliéster,8.0,Blanco
7790001000127,POL-NEG,Poliéster,7.5,Negro
7790001000134,POL-NEG,Poliéster,8.8,Negro
7790001000141,POL-ROJ,Poliéster,9.0,Rojo
7790001000158,LIN-BLA,Lino,6.5,Blanco
7790001000165,LIN-BLA,Lino,7.0,Blanco
7790001000172,LIN-CRU,Lino,6.8,Crudo
7790001000189,LIN-CRU,Lino,7.2,Crudo
7790001000196,SED-NEG,Seda,3.5,Negro
7790001000202,SED-ROJ,Seda,3.2,Rojo
7790001000219,DEN-AZU,Denim,15.0,Azul
7790001000226,DEN-AZU,Denim,14.5,Azul
7790001000233,DEN-AZU,Denim,16.0,Azul
7790001000240,DEN-NEG,Denim,14.0,Negro
7790001000257,GAB-BEI,Gabardina,10.5,Beige`;
